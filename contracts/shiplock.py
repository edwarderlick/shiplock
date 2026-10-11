# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import json
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

import genlayer as gl
from genlayer.storage import allow as allow_storage

Address = gl.Address
u256 = gl.u256
TreeMap = gl.storage.TreeMap
DynArray = gl.storage.DynArray

MAX_RESPONSE_BYTES = 256 * 1024  # 256 KB safety cap for HTTP responses

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        def emit_transfer(self, value: u256, /) -> None: ...

@allow_storage
@dataclass
class Escrow:
    funder: Address
    recipient: Address
    releaser: Address
    template: str
    package_name: str
    version: str
    window_start_utc: str
    window_end_utc: str
    expire_at_utc: str
    created_at: str
    query_url: str
    publish_time: str
    match_reason: str
    status: str
    yanked: bool
    amount: u256
    payout: u256
    refund: u256
    nonce: u256

def _as_address(val) -> Address:
    if isinstance(val, Address):
        return val
    if isinstance(val, bytes):
        return Address(val)
    s = str(val).strip()
    if s.startswith("b'") or s.startswith('b"'):
        import ast
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, bytes):
                return Address(parsed)
        except Exception:
            pass
    return Address(s)

def _msg_raw() -> dict:
    try:
        raw = getattr(gl.message, "raw", None)
        if isinstance(raw, dict):
            return raw
    except Exception:
        pass
    try:
        raw = getattr(gl, "message_raw", None)
        if isinstance(raw, dict):
            return raw
    except Exception:
        pass
    return {}

def _now_dt() -> datetime:
    raw = str(_msg_raw().get("datetime") or "").strip()
    if not raw:
        raise gl.vm.UserError("transaction timestamp unavailable")
    s = raw.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        raise gl.vm.UserError("transaction timestamp invalid")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _parse_utc(s: str) -> datetime:
    t = (s or "").strip()
    if not t:
        raise gl.vm.UserError("empty timestamp")
    t = t.replace(" UTC", "").replace(" utc", "").replace("Z", "+00:00")
    if "T" not in t and " " in t:
        t = t.replace(" ", "T", 1)
    if len(t) == 10:
        t = t + "T00:00:00+00:00"
    elif len(t) == 16:
        t = t + ":00+00:00"
    elif len(t) == 19:
        t = t + "+00:00"
    try:
        dt = datetime.fromisoformat(t)
    except Exception:
        raise gl.vm.UserError("invalid timestamp")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def _norm_pypi_name(name: str) -> str:
    return (name or "").strip().lower().replace("_", "-").replace(".", "-")

def _npm_query_url(pkg: str) -> str:
    safe = (pkg or "").strip()
    if safe.startswith("@") and "/" in safe:
        parts = safe.split("/", 1)
        safe = f"{parts[0]}%2F{parts[1]}"
    return f"https://registry.npmjs.org/{safe}"

def parse_pypi_metadata(data: dict, target_pkg: str, target_ver: str) -> dict:
    info = data.get("info")
    if not isinstance(info, dict):
        return {"status_code": 200, "kind": "non-json", "yanked": False, "publish_time": "", "error": "missing info"}
    
    returned_name = str(info.get("name") or "")
    returned_ver = str(info.get("version") or "")
    if _norm_pypi_name(returned_name) != _norm_pypi_name(target_pkg):
        return {"status_code": 200, "kind": "mismatch", "yanked": False, "publish_time": "", "error": "package name mismatch"}
    if returned_ver.strip() != (target_ver or "").strip():
        return {"status_code": 200, "kind": "mismatch", "yanked": False, "publish_time": "", "error": "version mismatch"}

    info_yanked = bool(info.get("yanked", False))
    urls = data.get("urls")
    if not isinstance(urls, list):
        urls = []

    # Policy for PyPI files and non-yanked timestamps:
    # PyPI release publication success requires a usable timestamp from an actual non-yanked file in urls[].
    # Do not use an info-level timestamp when urls[] is empty or unusable.
    non_yanked_times = []
    all_valid_times = []
    has_any_file = False
    all_files_yanked = True

    for item in urls:
        if not isinstance(item, dict):
            continue
        has_any_file = True
        item_yanked = bool(item.get("yanked", False))
        t = item.get("upload_time_iso_8601") or item.get("upload_time")
        if t:
            t_str = str(t).strip()
            try:
                _parse_utc(t_str)
                all_valid_times.append(t_str)
                if not item_yanked:
                    all_files_yanked = False
                    non_yanked_times.append(t_str)
            except Exception:
                # Unusable timestamp in this file record
                if not item_yanked:
                    all_files_yanked = False
        else:
            if not item_yanked:
                all_files_yanked = False

    # Check for yanked release:
    if info_yanked or (has_any_file and all_files_yanked):
        is_yanked = True
        pub_time = min(all_valid_times) if all_valid_times else ""
        return {
            "status_code": 200,
            "kind": "200",
            "yanked": True,
            "publish_time": pub_time
        }

    # For non-yanked release, publication evidence requires a usable timestamp from an actual non-yanked file in urls[].
    # If urls[] is empty or has no usable timestamp from a non-yanked file:
    if not non_yanked_times:
        return {
            "status_code": 200,
            "kind": "inconclusive",
            "yanked": False,
            "publish_time": "",
            "error": "no usable timestamp from non-yanked file in urls"
        }

    return {
        "status_code": 200,
        "kind": "200",
        "yanked": False,
        "publish_time": min(non_yanked_times)
    }

def parse_npm_metadata(data: dict, target_pkg: str, target_ver: str) -> dict:
    returned_name = str(data.get("name") or "")
    if returned_name.strip().lower() != (target_pkg or "").strip().lower():
        return {"status_code": 200, "kind": "mismatch", "yanked": False, "publish_time": "", "error": "package name mismatch"}

    time_map = data.get("time")
    versions_map = data.get("versions")

    # Treat missing or malformed versions or time maps as inconclusive
    if not isinstance(versions_map, dict) or not isinstance(time_map, dict):
        return {
            "status_code": 200,
            "kind": "inconclusive",
            "yanked": False,
            "publish_time": "",
            "error": "missing or malformed versions or time maps"
        }

    ver_key = (target_ver or "").strip()
    expected_pkg = (target_pkg or "").strip().lower()

    # Exact-version absence is only returned when both maps are valid objects
    # and the target key is absent from both.
    if (ver_key not in versions_map) and (ver_key not in time_map):
        return {"status_code": 404, "kind": "404", "yanked": False, "publish_time": "", "error": "version not published"}

    # npm success must require both:
    # 1. An exact versions[version] object matching the requested package/version
    # 2. A valid time[version] timestamp
    # If only one exists, classify the response as inconclusive, never RELEASED or REFUND_NOHIT.
    has_exact_ver_obj = False
    is_yanked = False
    if ver_key in versions_map:
        v_obj = versions_map.get(ver_key)
        if isinstance(v_obj, dict):
            v_name = str(v_obj.get("name") or "").strip().lower()
            v_ver = str(v_obj.get("version") or "").strip()
            if v_name == expected_pkg and v_ver == ver_key:
                has_exact_ver_obj = True
                # In documented npm semantics, deprecation is an advisory notice, NOT a yank or unpublish.
                # A deprecated version remains published and installable on npm.
                is_yanked = bool(v_obj.get("yanked", False))

    has_valid_time = False
    pub_time = ""
    if ver_key in time_map:
        raw_t = str(time_map.get(ver_key) or "").strip()
        if raw_t:
            try:
                _parse_utc(raw_t)
                has_valid_time = True
                pub_time = raw_t
            except Exception:
                has_valid_time = False

    if has_exact_ver_obj and has_valid_time:
        return {
            "status_code": 200,
            "kind": "200",
            "yanked": is_yanked,
            "publish_time": pub_time
        }

    return {
        "status_code": 200,
        "kind": "inconclusive",
        "yanked": False,
        "publish_time": "",
        "error": "incomplete npm version evidence"
    }

def fetch_metadata(url: str, template: str = "", expected_pkg: str = "", expected_ver: str = "") -> str:
    try:
        res = gl.nondet.web.get(url)
    except Exception:
        return json.dumps({
            "status_code": 0,
            "kind": "unavailable",
            "yanked": False,
            "publish_time": "",
            "error": "request failed"
        })
        
    if hasattr(res, "get") and not hasattr(res, "status") and not hasattr(res, "status_code"):
        blob = res
        if isinstance(blob, dict) and "ok" in blob and isinstance(blob["ok"], dict):
            blob = blob["ok"]
        if isinstance(blob, dict) and "response" in blob:
            blob = blob["response"]
        status = int((blob or {}).get("status") or (blob or {}).get("status_code") or 0) if isinstance(blob, dict) else 0
        body = (blob or {}).get("body", b"") if isinstance(blob, dict) else b""
    else:
        status = int(getattr(res, "status", getattr(res, "status_code", 0)) or 0)
        body = getattr(res, "body", getattr(res, "text", b""))

    if isinstance(body, str):
        raw = body.encode("utf-8", errors="replace")
        text = body
    else:
        raw = bytes(body or b"")
        text = raw.decode("utf-8", errors="replace")

    out = {
        "status_code": status,
        "kind": "",
        "yanked": False,
        "publish_time": "",
        "error": ""
    }

    # Only HTTP 200 is parsed as publication evidence.
    # HTTP 404 is definitive non-existence.
    # Any other status (429, 403, 3xx redirects, 5xx, 0, or unexpected statuses) is unavailable/inconclusive.
    if status == 404:
        out["kind"] = "404"
        return json.dumps(out)

    if status != 200:
        out["kind"] = "unavailable"
        out["error"] = f"unexpected HTTP status: {status}"
        return json.dumps(out)

    # HTTP 200 checks:
    if len(raw) > MAX_RESPONSE_BYTES:
        out["kind"] = "oversize"
        out["error"] = f"response size {len(raw)} exceeds {MAX_RESPONSE_BYTES} cap"
        return json.dumps(out)

    try:
        data = json.loads(text)
    except Exception:
        out["kind"] = "non-json"
        out["error"] = "response is not valid json"
        return json.dumps(out)

    if not isinstance(data, dict):
        out["kind"] = "non-json"
        out["error"] = "json root is not an object"
        return json.dumps(out)

    # Route parsing by template / registry
    is_pypi = (template == "PYPI_VERSION") or ("pypi.org" in url)
    is_npm = (template == "NPM_VERSION") or ("npmjs.org" in url)

    if is_pypi and expected_pkg and expected_ver:
        parsed = parse_pypi_metadata(data, expected_pkg, expected_ver)
        return json.dumps(parsed)
    elif is_npm and expected_pkg and expected_ver:
        parsed = parse_npm_metadata(data, expected_pkg, expected_ver)
        return json.dumps(parsed)

    # Fallback heuristic parser if target metadata is not supplied
    out["kind"] = "200"
    if "info" in data and isinstance(data["info"], dict):
        info = data["info"]
        out["yanked"] = bool(info.get("yanked", False))
        upload_time = info.get("upload_time_iso") or info.get("upload_time") or ""
        out["publish_time"] = str(upload_time)
    elif "time" in data:
        time_dict = data.get("time")
        if isinstance(time_dict, dict) and "version" in data:
            ver = str(data.get("version", ""))
            out["publish_time"] = str(time_dict.get(ver) or time_dict.get("created") or "")
        else:
            out["publish_time"] = str(data.get("time", ""))
            
    return json.dumps(out)


@allow_storage
class ShipLock(gl.contract.Contract):
    escrows: TreeMap[str, Escrow]
    ids: DynArray[str]
    credits: TreeMap[str, u256]
    
    escrowed_open: u256
    paid_to_recipients: u256
    refunded_to_funders: u256
    outstanding_credits: u256
    treasury: u256

    def __init__(self):
        self.escrowed_open = u256(0)
        self.paid_to_recipients = u256(0)
        self.refunded_to_funders = u256(0)
        self.outstanding_credits = u256(0)
        self.treasury = u256(0)

    def _pay(self, addr: Address, amount: u256) -> None:
        if amount == u256(0): return
        _Recipient(_as_address(addr)).emit_transfer(value=amount)

    @gl.public.write
    def withdraw(self) -> None:
        sender_addr = _as_address(gl.message.sender_address)
        addr_str = sender_addr.as_hex.lower()
        if addr_str not in self.credits:
            raise gl.vm.UserError("no credit")
        credit = self.credits[addr_str]
        if credit == u256(0):
            raise gl.vm.UserError("no credit")
        
        _Recipient(sender_addr).emit_transfer(value=credit)
        self.credits[addr_str] = u256(0)
        self.outstanding_credits = self.outstanding_credits - credit

    @gl.public.write.payable
    def fund_escrow(
        self,
        template: str,
        package_name: str,
        version: str,
        recipient: Address,
        window_start_utc: str,
        window_end_utc: str,
        nonce: u256 = u256(0),
    ) -> str:
        amount = gl.message.value
        funder = _as_address(gl.message.sender_address)
        payee = _as_address(recipient)
        zero = Address("0x0000000000000000000000000000000000000000")
        
        if amount == u256(0):
            raise gl.vm.UserError("amount must be > 0")
        if funder.as_hex.lower() == payee.as_hex.lower():
            raise gl.vm.UserError("recipient equals funder")
        if template not in ("PYPI_VERSION", "NPM_VERSION"):
            raise gl.vm.UserError("unknown template")
            
        pkg = (package_name or "").strip()
        ver = (version or "").strip()
        if not pkg or not ver:
            raise gl.vm.UserError("empty package or version")
            
        lower_pkg = pkg.lower()
        lower_ver = ver.lower()
        
        for p in (lower_pkg, lower_ver):
            if "latest" in p or "http://" in p or "https://" in p or "javascript:" in p:
                raise gl.vm.UserError("invalid name or version")
                
        start_dt = _parse_utc(window_start_utc)
        end_dt = _parse_utc(window_end_utc)
        now_dt = _now_dt()
        
        from datetime import timedelta
        if now_dt > start_dt - timedelta(hours=24):
            raise gl.vm.UserError("now <= window_start - 24h violated")
            
        diff_days = (end_dt - start_dt).total_seconds() / 86400
        if diff_days < 1 or diff_days > 14:
            raise gl.vm.UserError("1 day <= window_end - window_start <= 14 days violated")
            
        expire_at_dt = end_dt + timedelta(days=7)
        
        if template == "PYPI_VERSION":
            url = f"https://pypi.org/pypi/{pkg}/{ver}/json"
        else:
            url = _npm_query_url(pkg)
            
        metadata_str = gl.eq_principle.strict_eq(lambda: fetch_metadata(url, template, pkg, ver))
        metadata = json.loads(metadata_str)
        
        status_code = int(metadata.get("status_code", 0))
        kind = str(metadata.get("kind", ""))
        err = str(metadata.get("error", ""))

        # Permit funding ONLY when the registry result is a verified 404 or exact-version absence
        is_verified_absent = (status_code == 404 and kind == "404") or (
            status_code == 200 and kind == "404" and err == "version not published"
        )

        if not is_verified_absent:
            # Package or version is already published
            if status_code == 200 and kind == "200":
                if metadata.get("yanked"):
                    raise gl.vm.UserError("already yanked")
                raise gl.vm.UserError("already published")
            # Metadata mismatch (e.g. wrong package name or version returned)
            if kind == "mismatch":
                raise gl.vm.UserError(f"lookback metadata mismatch: {err}")
            # Malformed 200 responses
            if kind in ("non-json", "oversize"):
                raise gl.vm.UserError(f"lookback response malformed: {kind}")
            # Inconclusive responses (e.g. npm partial version/time, PyPI empty/unusable urls)
            if kind == "inconclusive":
                raise gl.vm.UserError(f"lookback response inconclusive: {err}")
            # Unexpected HTTP status (429, 403, redirects, 5xx) or unavailable evidence
            if status_code in (429, 403) or (300 <= status_code < 400) or status_code >= 500 or status_code == 0 or kind == "unavailable":
                raise gl.vm.UserError(f"lookback evidence unavailable: status={status_code}, kind={kind}")
            # Any other unexpected state
            raise gl.vm.UserError(f"lookback check inconclusive: status={status_code}, kind={kind}")
            
        # Escrow ID derived deterministically from stable transaction inputs
        funder_hex = funder.as_hex.lower()
        payee_hex = payee.as_hex.lower()
        raw = f"{funder_hex}|{payee_hex}|{template}|{pkg}|{ver}|{_iso(start_dt)}|{_iso(end_dt)}|{int(amount)}|{int(nonce)}".encode("utf-8")
        id_hash = "0x" + hashlib.sha256(raw).hexdigest()
        
        if id_hash in self.escrows:
            raise gl.vm.UserError("id collision")

        e = Escrow(
            funder=funder,
            recipient=payee,
            releaser=zero,
            template=template,
            package_name=pkg,
            version=ver,
            window_start_utc=_iso(start_dt),
            window_end_utc=_iso(end_dt),
            expire_at_utc=_iso(expire_at_dt),
            created_at=_iso(now_dt),
            query_url=url,
            publish_time="",
            match_reason="LOOKBACK_404_OK",
            status="OPEN",
            yanked=False,
            amount=amount,
            payout=u256(0),
            refund=u256(0),
            nonce=nonce,
        )
        self.escrows[id_hash] = e
        self.escrowed_open = self.escrowed_open + amount
        self.ids.append(id_hash)
        
        return id_hash

    @gl.public.write
    def release(self, id: str) -> None:
        if id not in self.escrows:
            raise gl.vm.UserError("escrow not found")
        e = self.escrows[id]
        if e.status != "OPEN":
            raise gl.vm.UserError("not OPEN")
            
        sender = _as_address(gl.message.sender_address)
        if sender.as_hex.lower() == _as_address(e.funder).as_hex.lower():
            raise gl.vm.UserError("Funder cannot release")
            
        now_dt = _now_dt()
        start_dt = _parse_utc(e.window_start_utc)
        end_dt = _parse_utc(e.window_end_utc)
        exp_dt = _parse_utc(e.expire_at_utc)
        
        if now_dt < start_dt or now_dt >= exp_dt:
            raise gl.vm.UserError("window_start <= now < expire_at violated")
            
        metadata_str = gl.eq_principle.strict_eq(lambda: fetch_metadata(e.query_url, e.template, e.package_name, e.version))
        metadata = json.loads(metadata_str)
        kind = str(metadata.get("kind", ""))
        status_code = int(metadata.get("status_code", 0))
        err = str(metadata.get("error", ""))

        # Parse publication timestamp if available
        pub_dt = None
        raw_pub_time = metadata.get("publish_time", "")
        if raw_pub_time:
            try:
                pub_dt = _parse_utc(raw_pub_time)
            except Exception:
                pub_dt = None

        is_yanked = bool(metadata.get("yanked", False))

        # Check for successful publication inside inclusive window [start_dt, end_dt]
        # Valid releases may settle after window_end_utc as long as pub_dt is inside the window
        if kind == "200" and not is_yanked and pub_dt is not None and (start_dt <= pub_dt <= end_dt):
            e.match_reason = "200_IN_WINDOW"
            e.publish_time = raw_pub_time
            e.yanked = False
            e.releaser = sender
            self._pay(Address(str(e.recipient)), e.amount)
            e.status = "RELEASED"
            e.payout = e.amount
            self.escrowed_open = self.escrowed_open - e.amount
            self.paid_to_recipients = self.paid_to_recipients + e.amount
            self.escrows[id] = e
            return

        is_verified_404 = (status_code == 404 and kind == "404") or (
            status_code == 200 and kind == "404" and err == "version not published"
        )

        # Publication window boundary check:
        # Window end condition: window has ended when now_dt >= end_dt.
        # Before window end (now_dt < end_dt), publication window is still OPEN.
        if now_dt < end_dt:
            # An inconclusive check before window_end leaves the escrow OPEN with no fund movements
            if is_verified_404:
                e.match_reason = "EARLY_404_RETRYABLE"
            elif kind in ("unavailable", "oversize", "non-json", "mismatch", "inconclusive") or status_code != 200:
                e.match_reason = f"EARLY_{kind.upper()}_RETRYABLE" if kind else "EARLY_TEMPORARY_FAILURE"
            else:
                e.match_reason = "EARLY_INCONCLUSIVE_RETRYABLE"
            self.escrows[id] = e
            return

        # At or after window_end_utc (now_dt >= end_dt):
        # Treat 429, 403, redirects, 5xx, oversize, non-json, metadata mismatches, inconclusive responses,
        # and any HTTP 200 response lacking sufficient evidence as inconclusive.
        # These MUST leave the escrow OPEN with no transfer!
        if kind in ("unavailable", "oversize", "non-json", "mismatch", "inconclusive") or (status_code not in (200, 404)):
            e.match_reason = f"POST_WINDOW_{kind.upper()}" if kind else "POST_WINDOW_UNAVAILABLE"
            self.escrows[id] = e
            return

        # Final no-hit remains allowed ONLY for:
        # 1. verified 404 (package or exact version does not exist)
        # 2. verified yanked release
        # 3. verified, time-stamped publication outside the window (pub_dt > end_dt or pub_dt < start_dt)
        if is_verified_404:
            e.match_reason = "WINDOW_EXPIRED_NO_RELEASE"
            e.releaser = sender
            self._pay(Address(str(e.funder)), e.amount)
            e.status = "REFUND_NOHIT"
            e.refund = e.amount
            self.escrowed_open = self.escrowed_open - e.amount
            self.refunded_to_funders = self.refunded_to_funders + e.amount
            self.escrows[id] = e
            return

        if kind == "200":
            if is_yanked:
                e.match_reason = "YANKED"
                e.yanked = True
                if raw_pub_time:
                    e.publish_time = raw_pub_time
                e.releaser = sender
                self._pay(Address(str(e.funder)), e.amount)
                e.status = "REFUND_NOHIT"
                e.refund = e.amount
                self.escrowed_open = self.escrowed_open - e.amount
                self.refunded_to_funders = self.refunded_to_funders + e.amount
                self.escrows[id] = e
                return

            if pub_dt is not None:
                if pub_dt > end_dt:
                    e.match_reason = "PUBLISHED_AFTER_WINDOW"
                elif pub_dt < start_dt:
                    e.match_reason = "PUBLISHED_BEFORE_WINDOW"
                else:
                    e.match_reason = "200_IN_WINDOW"

                e.publish_time = raw_pub_time
                e.releaser = sender
                self._pay(Address(str(e.funder)), e.amount)
                e.status = "REFUND_NOHIT"
                e.refund = e.amount
                self.escrowed_open = self.escrowed_open - e.amount
                self.refunded_to_funders = self.refunded_to_funders + e.amount
                self.escrows[id] = e
                return

        # Any HTTP 200 lacking sufficient evidence (e.g. pub_dt is None and not yanked):
        # Must leave the escrow OPEN with no transfer!
        e.match_reason = "POST_WINDOW_INSUFFICIENT_EVIDENCE"
        self.escrows[id] = e
        return

    @gl.public.write
    def cancel(self, id: str) -> None:
        if id not in self.escrows:
            raise gl.vm.UserError("escrow not found")
        e = self.escrows[id]
        if e.status != "OPEN":
            raise gl.vm.UserError("not OPEN")
            
        sender = _as_address(gl.message.sender_address)
        if sender.as_hex.lower() != _as_address(e.funder).as_hex.lower():
            raise gl.vm.UserError("only funder can cancel")
            
        now_dt = _now_dt()
        start_dt = _parse_utc(e.window_start_utc)
        if now_dt >= start_dt:
            raise gl.vm.UserError("now < window_start violated")
            
        self._pay(Address(str(e.funder)), e.amount)
        e.status = "CANCELED"
        e.refund = e.amount
        self.escrowed_open = self.escrowed_open - e.amount
        self.refunded_to_funders = self.refunded_to_funders + e.amount
        self.escrows[id] = e

    @gl.public.write
    def expire(self, id: str) -> None:
        if id not in self.escrows:
            raise gl.vm.UserError("escrow not found")
        e = self.escrows[id]
        if e.status != "OPEN":
            raise gl.vm.UserError("not OPEN")
            
        now_dt = _now_dt()
        exp_dt = _parse_utc(e.expire_at_utc)
        if now_dt < exp_dt:
            raise gl.vm.UserError("now >= expire_at violated")
            
        self._pay(Address(str(e.funder)), e.amount)
        e.status = "EXPIRED"
        e.refund = e.amount
        self.escrowed_open = self.escrowed_open - e.amount
        self.refunded_to_funders = self.refunded_to_funders + e.amount
        self.escrows[id] = e

    @gl.public.view
    def get_escrow(self, id: str) -> dict:
        if id not in self.escrows:
            raise gl.vm.UserError("escrow not found")
        e = self.escrows[id]
        return {
            "id": id,
            "funder": str(e.funder),
            "recipient": str(e.recipient),
            "template": e.template,
            "package_name": e.package_name,
            "version": e.version,
            "window_start_utc": e.window_start_utc,
            "window_end_utc": e.window_end_utc,
            "expire_at_utc": e.expire_at_utc,
            "amount": int(e.amount),
            "status": e.status,
            "created_at": e.created_at,
            "query_url": e.query_url,
            "yanked": e.yanked,
            "publish_time": e.publish_time,
            "match_reason": e.match_reason,
            "payout": int(e.payout),
            "refund": int(e.refund),
            "releaser": str(e.releaser),
            "nonce": int(e.nonce),
        }

    @gl.public.view
    def list_ids(self) -> list:
        return [str(x) for x in self.ids]

    @gl.public.view
    def get_escrow_ids(self) -> list:
        return [str(x) for x in self.ids]

    @gl.public.view
    def get_economics(self) -> dict:
        return {
            "escrowed_open": int(self.escrowed_open),
            "paid_to_recipients": int(self.paid_to_recipients),
            "refunded_to_funders": int(self.refunded_to_funders),
            "outstanding_credits": int(self.outstanding_credits),
            "treasury": int(self.treasury),
        }

    @gl.public.view
    def get_credit(self, addr: str) -> int:
        a = _as_address(addr).as_hex.lower()
        if a not in self.credits:
            return 0
        return int(self.credits[a])
