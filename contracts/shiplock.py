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

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass

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
    raw = str(_msg_raw().get("datetime") or "")
    if raw:
        s = raw.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass
    return datetime.now(timezone.utc)

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

def fetch_metadata(url: str) -> str:
    try:
        res = gl.nondet.web.get(url)
    except Exception:
        return json.dumps({
            "status_code": 0,
            "kind": "5xx",
            "yanked": False,
            "publish_time": ""
        })
        
    if hasattr(res, "get") and not hasattr(res, "status"):
        blob = res
        if isinstance(blob, dict) and "ok" in blob and isinstance(blob["ok"], dict):
            blob = blob["ok"]
        if isinstance(blob, dict) and "response" in blob:
            blob = blob["response"]
        status = int((blob or {}).get("status") or 0) if isinstance(blob, dict) else 0
        body = (blob or {}).get("body", b"") if isinstance(blob, dict) else b""
    else:
        status = int(getattr(res, "status", 0) or 0)
        body = getattr(res, "body", b"")

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
    }

    if status >= 500 or status == 0:
        out["kind"] = "5xx"
        return json.dumps(out)
        
    if status == 404:
        out["kind"] = "404"
        return json.dumps(out)
        
    if len(raw) > 32 * 1024:
        out["kind"] = "oversize"
        return json.dumps(out)
        
    try:
        data = json.loads(text)
    except Exception:
        out["kind"] = "non-json"
        return json.dumps(out)

    if not isinstance(data, dict):
        out["kind"] = "non-json"
        return json.dumps(out)

    out["kind"] = "200"
    
    if "info" in data and isinstance(data["info"], dict):
        info = data["info"]
        out["yanked"] = bool(info.get("yanked", False))
        upload_time = info.get("upload_time_iso") or info.get("upload_time") or ""
        out["publish_time"] = str(upload_time)
    elif "yanked" in data or "time" in data:
        out["yanked"] = bool(data.get("yanked", False))
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
    buy_seq: u256
    
    escrowed_open: u256
    paid_to_recipients: u256
    refunded_to_funders: u256
    outstanding_credits: u256
    treasury: u256

    def __init__(self):
        self.buy_seq = u256(0)
        
        self.escrowed_open = u256(0)
        self.paid_to_recipients = u256(0)
        self.refunded_to_funders = u256(0)
        self.outstanding_credits = u256(0)
        self.treasury = u256(0)

    def _pay(self, addr: Address, amount: u256) -> None:
        if amount == u256(0): return
        _Recipient(addr).emit_transfer(value=amount)

    @gl.public.write
    def withdraw(self) -> None:
        addr_str = str(gl.message.sender_address)
        if addr_str not in self.credits:
            raise gl.vm.UserError("no credit")
        credit = self.credits[addr_str]
        if credit == u256(0):
            raise gl.vm.UserError("no credit")
        
        _Recipient(Address(str(gl.message.sender_address))).emit_transfer(value=credit)
        
        self.credits[addr_str] = u256(0)
        self.outstanding_credits = self.outstanding_credits - credit

    @gl.public.write.payable
    def fund_escrow(self, template: str, package_name: str, version: str, recipient: Address, window_start_utc: str, window_end_utc: str) -> str:
        amount = gl.message.value
        funder = Address(str(gl.message.sender_address))
        payee = Address(str(recipient))
        zero = Address("0x0000000000000000000000000000000000000000")
        
        if amount == u256(0):
            raise gl.vm.UserError("amount must be > 0")
        if funder == payee:
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
            url = f"https://registry.npmjs.org/{pkg}/{ver}"
            
        metadata_str = gl.eq_principle.strict_eq(lambda: fetch_metadata(url))
        metadata = json.loads(metadata_str)
        
        kind = metadata.get("kind", "")
        if kind in ("5xx", "oversize", "non-json", "") or metadata.get("status_code", 0) == 0:
            raise gl.vm.UserError(f"lookback evidence unavailable: kind={kind}, status={metadata.get('status_code', 0)}")
            
        if kind == "200":
            if metadata.get("yanked"):
                raise gl.vm.UserError("already yanked")
            raise gl.vm.UserError("already published")
            
        seq = self.buy_seq + u256(1)
        self.buy_seq = seq
        
        raw_hash = f"{funder}|{recipient}|{template}|{pkg}|{ver}|{_iso(start_dt)}|{int(amount)}|{int(seq)}".encode("utf-8")
        id_hash = "0x" + hashlib.sha256(raw_hash).hexdigest()
        
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
        if str(gl.message.sender_address) == str(e.funder):
            raise gl.vm.UserError("Funder cannot release")
            
        now_dt = _now_dt()
        start_dt = _parse_utc(e.window_start_utc)
        end_dt = _parse_utc(e.window_end_utc)
        exp_dt = _parse_utc(e.expire_at_utc)
        
        if now_dt < start_dt or now_dt >= exp_dt:
            raise gl.vm.UserError("window_start <= now < expire_at violated")
            
        metadata_str = gl.eq_principle.strict_eq(lambda: fetch_metadata(e.query_url))
        metadata = json.loads(metadata_str)
        kind = metadata.get("kind", "")
        
        e.releaser = Address(str(gl.message.sender_address))
        
        if kind in ("5xx", "oversize", "non-json", "") or metadata.get("status_code", 0) == 0:
            e.match_reason = kind or "fetch failure"
            self._pay(Address(str(e.funder)), e.amount)
            e.status = "INSUFFICIENT"
            e.refund = e.amount
            self.escrowed_open = self.escrowed_open - e.amount
            self.refunded_to_funders = self.refunded_to_funders + e.amount
            self.escrows[id] = e
            return
            
        e.yanked = metadata.get("yanked", False)
        e.publish_time = metadata.get("publish_time", "")
        
        pub_dt = None
        if e.publish_time:
            try:
                pub_dt = _parse_utc(e.publish_time)
            except Exception:
                pass
                
        if kind == "200" and not e.yanked and pub_dt is not None and start_dt <= pub_dt <= end_dt:
            e.match_reason = "200_IN_WINDOW"
            self._pay(Address(str(e.recipient)), e.amount)
            e.status = "RELEASED"
            e.payout = e.amount
            self.escrowed_open = self.escrowed_open - e.amount
            self.paid_to_recipients = self.paid_to_recipients + e.amount
            self.escrows[id] = e
            return
            
        e.match_reason = "MISS_OR_YANKED_OR_OUT_OF_WINDOW"
        self._pay(Address(str(e.funder)), e.amount)
        e.status = "REFUND_NOHIT"
        e.refund = e.amount
        self.escrowed_open = self.escrowed_open - e.amount
        self.refunded_to_funders = self.refunded_to_funders + e.amount
        self.escrows[id] = e

    @gl.public.write
    def cancel(self, id: str) -> None:
        if id not in self.escrows:
            raise gl.vm.UserError("escrow not found")
        e = self.escrows[id]
        if e.status != "OPEN":
            raise gl.vm.UserError("not OPEN")
        if str(gl.message.sender_address) != str(e.funder):
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
            "releaser": str(e.releaser)
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
        a = addr.strip()
        if a not in self.credits:
            return 0
        return int(self.credits[a])
