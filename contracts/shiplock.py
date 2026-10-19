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
    policy: str = "REGISTRY_ONLY"
    expected_repo: str = ""
    expected_tag: str = ""
    registry_evidence: str = ""
    github_evidence: str = ""

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

MAX_REPO_LEN = 128
MIN_REPO_LEN = 3
MAX_TAG_LEN = 128
MIN_TAG_LEN = 1
GITHUB_API_BASE = "https://api.github.com/repos"
POLICY_REGISTRY_ONLY = "REGISTRY_ONLY"
POLICY_SOURCE_LINKED = "SOURCE_LINKED"

def _validate_github_repo(repo_str: str) -> str:
    if not repo_str or not isinstance(repo_str, str) or repo_str != repo_str.strip():
        raise gl.vm.UserError("expected_repo cannot be empty or have leading/trailing whitespace")
    s = repo_str.strip()
    if len(s) < MIN_REPO_LEN or len(s) > MAX_REPO_LEN:
        raise gl.vm.UserError("expected_repo length out of bounds")

    for ch in s:
        code = ord(ch)
        if code < 33 or code > 126:
            raise gl.vm.UserError("expected_repo contains whitespace, control character, or non-ASCII")
        if ch in ("?", "#", "%", "\\", "@", "~", ";", "&", ":", "$", "!", "*", "(", ")", "+", "=", "[", "]", "{", "}", "|", "^", "<", ">", "\"", "'", "`"):
            raise gl.vm.UserError(f"expected_repo contains forbidden character: {ch}")

    if "://" in s or s.startswith("//"):
        raise gl.vm.UserError("expected_repo cannot contain scheme")
    if ".." in s:
        raise gl.vm.UserError("expected_repo cannot contain path traversal")

    parts = s.split("/")
    if len(parts) != 2:
        raise gl.vm.UserError("expected_repo must be in canonical 'owner/repo' format with exactly one slash")

    owner, repo = parts[0], parts[1]
    if not owner or not repo:
        raise gl.vm.UserError("owner and repo must both be non-empty")
    if len(owner) > 39:
        raise gl.vm.UserError("owner length cannot exceed 39 characters")
    if len(repo) > 100:
        raise gl.vm.UserError("repo length cannot exceed 100 characters")

    if owner.startswith("-") or owner.endswith("-") or "--" in owner:
        raise gl.vm.UserError("invalid owner syntax: cannot start/end with hyphen or have consecutive hyphens")
    for ch in owner:
        if not (('a' <= ch <= 'z') or ('A' <= ch <= 'Z') or ('0' <= ch <= '9') or ch == '-'):
            raise gl.vm.UserError(f"invalid character in owner: {ch}")

    if repo in (".", "..") or repo.endswith(".git") or repo.startswith(".") or repo.startswith("-"):
        raise gl.vm.UserError("invalid repo syntax: cannot start with dot/hyphen, cannot end in .git, cannot be . or ..")
    for ch in repo:
        if not (('a' <= ch <= 'z') or ('A' <= ch <= 'Z') or ('0' <= ch <= '9') or ch in ("-", "_", ".")):
            raise gl.vm.UserError(f"invalid character in repo: {ch}")

    return f"{owner.lower()}/{repo.lower()}"

def _validate_github_tag(tag_str: str) -> str:
    if not tag_str or not isinstance(tag_str, str) or tag_str != tag_str.strip():
        raise gl.vm.UserError("expected_tag cannot be empty or have leading/trailing whitespace")
    t = tag_str.strip()
    if len(t) < MIN_TAG_LEN or len(t) > MAX_TAG_LEN:
        raise gl.vm.UserError("expected_tag length out of bounds")

    for ch in t:
        code = ord(ch)
        if code < 33 or code > 126:
            raise gl.vm.UserError("expected_tag contains whitespace, control character, or non-ASCII")
        if ch in ("/", "\\", "?", "#", "%", "~", "^", ":", "*", "[", "]", "@{", "@", "$", ";", "&", "|", "<", ">", "\"", "'", "`"):
            raise gl.vm.UserError(f"expected_tag contains forbidden character: {ch}")

    if "://" in t or t.startswith("//"):
        raise gl.vm.UserError("expected_tag cannot contain scheme")
    if ".." in t or t == "." or t.startswith(".") or t.endswith(".") or t.endswith(".lock"):
        raise gl.vm.UserError("invalid tag syntax")

    return t

def _normalize_github_repo_url(val: str) -> str:
    if not val or not isinstance(val, str):
        return ""
    s = val.strip()
    if not s:
        return ""
    for ch in s:
        code = ord(ch)
        if code <= 32 or (127 <= code <= 159):
            return ""

    remainder = None
    if s.startswith("git+https://github.com/"):
        remainder = s[len("git+https://github.com/"):]
    elif s.startswith("ssh://git@github.com/"):
        remainder = s[len("ssh://git@github.com/"):]
    elif s.startswith("git@github.com:"):
        remainder = s[len("git@github.com:"):]
    elif s.startswith("https://github.com/"):
        remainder = s[len("https://github.com/"):]
    elif s.startswith("http://github.com/"):
        remainder = s[len("http://github.com/"):]
    elif s.startswith("github:"):
        remainder = s[len("github:"):]
        if remainder.startswith("/") or remainder.startswith("\\"):
            return ""
    elif "/" in s and not ("://" in s or ":" in s or "@" in s or "\\" in s):
        remainder = s
    else:
        return ""

    path = remainder
    if "?" in path:
        path = path.split("?", 1)[0]
    if "#" in path:
        path = path.split("#", 1)[0]
    path = path.strip()

    if path.endswith("/"):
        path = path[:-1]
    if path.endswith(".git"):
        path = path[:-4]
    if path.endswith("/"):
        path = path[:-1]

    parts = path.split("/")
    if len(parts) != 2:
        return ""

    owner, repo = parts[0], parts[1]
    if not owner or not repo:
        return ""

    try:
        return _validate_github_repo(f"{owner}/{repo}")
    except Exception:
        return ""

def _extract_pypi_repo(data: dict) -> str:
    info = data.get("info")
    if not isinstance(info, dict):
        return ""
    project_urls = info.get("project_urls")
    if isinstance(project_urls, dict):
        priority_keys = ["source", "repository", "code", "github", "repo", "homepage", "home"]
        for pkey in priority_keys:
            for k, u in project_urls.items():
                if pkey in str(k).lower():
                    norm = _normalize_github_repo_url(str(u or ""))
                    if norm: return norm
        for k, u in project_urls.items():
            norm = _normalize_github_repo_url(str(u or ""))
            if norm: return norm

    for fallback_field in ("project_url", "home_page"):
        u = info.get(fallback_field)
        if u:
            norm = _normalize_github_repo_url(str(u or ""))
            if norm: return norm
    return ""

def _extract_npm_repo(data: dict, ver_key: str) -> str:
    versions_map = data.get("versions")
    if isinstance(versions_map, dict) and ver_key in versions_map:
        v_obj = versions_map.get(ver_key)
        if isinstance(v_obj, dict):
            repo_entry = v_obj.get("repository")
            if isinstance(repo_entry, dict):
                norm = _normalize_github_repo_url(str(repo_entry.get("url") or ""))
                if norm: return norm
            elif isinstance(repo_entry, str):
                norm = _normalize_github_repo_url(repo_entry)
                if norm: return norm
    top_repo = data.get("repository")
    if isinstance(top_repo, dict):
        norm = _normalize_github_repo_url(str(top_repo.get("url") or ""))
        if norm: return norm
    elif isinstance(top_repo, str):
        norm = _normalize_github_repo_url(top_repo)
        if norm: return norm
    return ""

def parse_pypi_metadata(data: dict, target_pkg: str, target_ver: str) -> dict:
    info = data.get("info")
    repo = _extract_pypi_repo(data)
    if not isinstance(info, dict):
        return {"status_code": 200, "kind": "non-json", "yanked": False, "publish_time": "", "repository": "", "error": "missing info"}

    returned_name = str(info.get("name") or "")
    returned_ver = str(info.get("version") or "")
    if _norm_pypi_name(returned_name) != _norm_pypi_name(target_pkg):
        return {"status_code": 200, "kind": "mismatch", "yanked": False, "publish_time": "", "repository": repo, "error": "package name mismatch"}
    if returned_ver.strip() != (target_ver or "").strip():
        return {"status_code": 200, "kind": "mismatch", "yanked": False, "publish_time": "", "repository": repo, "error": "version mismatch"}

    info_yanked = bool(info.get("yanked", False))
    urls = data.get("urls")
    if not isinstance(urls, list):
        urls = []

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
                if not item_yanked:
                    all_files_yanked = False
        else:
            if not item_yanked:
                all_files_yanked = False

    if info_yanked or (has_any_file and all_files_yanked):
        pub_time = min(all_valid_times) if all_valid_times else ""
        return {
            "status_code": 200,
            "kind": "200",
            "yanked": True,
            "publish_time": pub_time,
            "repository": repo,
            "error": ""
        }

    if not non_yanked_times:
        return {
            "status_code": 200,
            "kind": "inconclusive",
            "yanked": False,
            "publish_time": "",
            "repository": repo,
            "error": "no usable timestamp from non-yanked file in urls"
        }

    return {
        "status_code": 200,
        "kind": "200",
        "yanked": False,
        "publish_time": min(non_yanked_times),
        "repository": repo,
        "error": ""
    }

def parse_npm_metadata(data: dict, target_pkg: str, target_ver: str) -> dict:
    returned_name = str(data.get("name") or "")
    ver_key = (target_ver or "").strip()
    expected_pkg = (target_pkg or "").strip().lower()
    repo = _extract_npm_repo(data, ver_key)

    if returned_name.strip().lower() != expected_pkg:
        return {"status_code": 200, "kind": "mismatch", "yanked": False, "publish_time": "", "repository": repo, "error": "package name mismatch"}

    time_map = data.get("time")
    versions_map = data.get("versions")

    if not isinstance(versions_map, dict) or not isinstance(time_map, dict):
        return {
            "status_code": 200,
            "kind": "inconclusive",
            "yanked": False,
            "publish_time": "",
            "repository": repo,
            "error": "missing or malformed versions or time maps"
        }

    if (ver_key not in versions_map) and (ver_key not in time_map):
        return {"status_code": 404, "kind": "404", "yanked": False, "publish_time": "", "repository": repo, "error": "version not published"}

    has_exact_ver_obj = False
    is_yanked = False
    if ver_key in versions_map:
        v_obj = versions_map.get(ver_key)
        if isinstance(v_obj, dict):
            v_name = str(v_obj.get("name") or "").strip().lower()
            v_ver = str(v_obj.get("version") or "").strip()
            if v_name == expected_pkg and v_ver == ver_key:
                has_exact_ver_obj = True
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
            "publish_time": pub_time,
            "repository": repo,
            "error": ""
        }

    return {
        "status_code": 200,
        "kind": "inconclusive",
        "yanked": False,
        "publish_time": "",
        "repository": repo,
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
            "repository": "",
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
        "repository": "",
        "error": ""
    }

    if status == 404:
        out["kind"] = "404"
        return json.dumps(out)

    if status != 200:
        out["kind"] = "unavailable"
        out["error"] = f"unexpected HTTP status: {status}"
        return json.dumps(out)

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

    is_pypi = (template == "PYPI_VERSION") or ("pypi.org" in url)
    is_npm = (template == "NPM_VERSION") or ("npmjs.org" in url)

    if is_pypi and expected_pkg and expected_ver:
        parsed = parse_pypi_metadata(data, expected_pkg, expected_ver)
        return json.dumps(parsed)
    elif is_npm and expected_pkg and expected_ver:
        parsed = parse_npm_metadata(data, expected_pkg, expected_ver)
        return json.dumps(parsed)

    out["kind"] = "200"
    if "info" in data and isinstance(data["info"], dict):
        info = data["info"]
        out["yanked"] = bool(info.get("yanked", False))
        upload_time = info.get("upload_time_iso") or info.get("upload_time") or ""
        out["publish_time"] = str(upload_time)
        out["repository"] = _extract_pypi_repo(data)
    elif "time" in data:
        time_dict = data.get("time")
        if isinstance(time_dict, dict) and "version" in data:
            ver = str(data.get("version", ""))
            out["publish_time"] = str(time_dict.get(ver) or time_dict.get("created") or "")
            out["repository"] = _extract_npm_repo(data, ver)
        else:
            out["publish_time"] = str(data.get("time", ""))

    return json.dumps(out)

def parse_github_release_metadata(text: str, status_code: int, raw_bytes_len: int, expected_owner: str, expected_repo: str, expected_tag: str) -> dict:
    out = {
        "status_code": status_code,
        "kind": "",
        "tag_name": "",
        "draft": False,
        "published_at": "",
        "repository": "",
        "error": ""
    }

    if status_code == 404:
        out["kind"] = "404"
        out["error"] = "release not found"
        return out

    if status_code != 200:
        out["kind"] = "unavailable"
        out["error"] = f"unexpected HTTP status: {status_code}"
        return out

    if raw_bytes_len > MAX_RESPONSE_BYTES:
        out["kind"] = "oversize"
        out["error"] = f"response size {raw_bytes_len} exceeds {MAX_RESPONSE_BYTES} cap"
        return out

    try:
        data = json.loads(text)
    except Exception:
        out["kind"] = "non-json"
        out["error"] = "response is not valid json"
        return out

    if not isinstance(data, dict):
        out["kind"] = "non-json"
        out["error"] = "json root is not an object"
        return out

    tag_name = str(data.get("tag_name") or "").strip()
    out["tag_name"] = tag_name

    if tag_name != expected_tag:
        out["kind"] = "mismatch"
        out["error"] = f"tag mismatch: got '{tag_name}', expected '{expected_tag}'"
        return out

    draft = bool(data.get("draft", False))
    out["draft"] = draft
    if draft:
        out["kind"] = "inconclusive"
        out["error"] = "release is draft"
        return out

    raw_pub = str(data.get("published_at") or data.get("created_at") or "").strip()
    if not raw_pub:
        out["kind"] = "inconclusive"
        out["error"] = "missing release timestamp"
        return out

    try:
        _parse_utc(raw_pub)
        out["published_at"] = raw_pub
    except Exception:
        out["kind"] = "inconclusive"
        out["error"] = f"invalid release timestamp: {raw_pub}"
        return out

    release_url = str(data.get("url") or data.get("html_url") or "")
    if release_url:
        norm_r = _normalize_github_repo_url(release_url)
        if norm_r:
            out["repository"] = norm_r
        else:
            out["repository"] = f"{expected_owner.lower()}/{expected_repo.lower()}"
    else:
        out["repository"] = f"{expected_owner.lower()}/{expected_repo.lower()}"

    out["kind"] = "200"
    return out

def fetch_github_release(expected_owner: str, expected_repo: str, expected_tag: str) -> str:
    url = f"{GITHUB_API_BASE}/{expected_owner}/{expected_repo}/releases/tags/{expected_tag}"
    try:
        res = gl.nondet.web.get(url)
    except Exception:
        return json.dumps({
            "status_code": 0,
            "kind": "unavailable",
            "tag_name": "",
            "draft": False,
            "published_at": "",
            "repository": "",
            "error": "request failed"
        }, sort_keys=True)

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

    parsed = parse_github_release_metadata(text, status, len(raw), expected_owner, expected_repo, expected_tag)
    return json.dumps(parsed, sort_keys=True)


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
            policy=POLICY_REGISTRY_ONLY,
            expected_repo="",
            expected_tag="",
            registry_evidence="",
            github_evidence="",
        )
        self.escrows[id_hash] = e
        self.escrowed_open = self.escrowed_open + amount
        self.ids.append(id_hash)

        return id_hash

    @gl.public.write.payable
    def fund_verified_escrow(
        self,
        template: str,
        package_name: str,
        version: str,
        expected_repo: str,
        expected_tag: str,
        recipient: Address,
        window_start_utc: str,
        window_end_utc: str,
        nonce: u256 = u256(0),
    ) -> str:
        canon_repo = _validate_github_repo(expected_repo)
        canon_tag = _validate_github_tag(expected_tag)

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

        is_verified_absent = (status_code == 404 and kind == "404") or (
            status_code == 200 and kind == "404" and err == "version not published"
        )

        if not is_verified_absent:
            if status_code == 200 and kind == "200":
                if metadata.get("yanked"):
                    raise gl.vm.UserError("already yanked")
                raise gl.vm.UserError("already published")
            if kind == "mismatch":
                raise gl.vm.UserError(f"lookback metadata mismatch: {err}")
            if kind in ("non-json", "oversize"):
                raise gl.vm.UserError(f"lookback response malformed: {kind}")
            if kind == "inconclusive":
                raise gl.vm.UserError(f"lookback response inconclusive: {err}")
            if status_code in (429, 403) or (300 <= status_code < 400) or status_code >= 500 or status_code == 0 or kind == "unavailable":
                raise gl.vm.UserError(f"lookback evidence unavailable: status={status_code}, kind={kind}")
            raise gl.vm.UserError(f"lookback check inconclusive: status={status_code}, kind={kind}")

        funder_hex = funder.as_hex.lower()
        payee_hex = payee.as_hex.lower()
        raw = f"{funder_hex}|{payee_hex}|{template}|{pkg}|{ver}|{canon_repo}|{canon_tag}|{_iso(start_dt)}|{_iso(end_dt)}|{int(amount)}|{int(nonce)}".encode("utf-8")
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
            policy=POLICY_SOURCE_LINKED,
            expected_repo=canon_repo,
            expected_tag=canon_tag,
            registry_evidence="",
            github_evidence="",
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

        if getattr(e, "policy", POLICY_REGISTRY_ONLY) == POLICY_SOURCE_LINKED:
            owner, repo_name = e.expected_repo.split("/", 1)
            def _fetch_all():
                reg_s = fetch_metadata(e.query_url, e.template, e.package_name, e.version)
                gh_s = fetch_github_release(owner, repo_name, e.expected_tag)
                return json.dumps({
                    "registry": json.loads(reg_s),
                    "github": json.loads(gh_s)
                }, sort_keys=True)

            all_ev_str = gl.eq_principle.strict_eq(_fetch_all)
            all_ev = json.loads(all_ev_str)
            reg_meta = all_ev["registry"]
            gh_meta = all_ev["github"]

            e.registry_evidence = json.dumps(reg_meta, sort_keys=True)
            e.github_evidence = json.dumps(gh_meta, sort_keys=True)

            reg_kind = str(reg_meta.get("kind", ""))
            reg_status = int(reg_meta.get("status_code", 0))
            reg_yanked = bool(reg_meta.get("yanked", False))
            reg_raw_pub = str(reg_meta.get("publish_time", "")).strip()
            reg_repo = str(reg_meta.get("repository", "")).strip().lower()

            gh_kind = str(gh_meta.get("kind", ""))
            gh_status = int(gh_meta.get("status_code", 0))
            gh_draft = bool(gh_meta.get("draft", False))
            gh_raw_pub = str(gh_meta.get("published_at", "")).strip()
            gh_tag = str(gh_meta.get("tag_name", "")).strip()
            gh_repo = str(gh_meta.get("repository", "")).strip().lower()

            reg_pub_dt = None
            if reg_raw_pub:
                try:
                    reg_pub_dt = _parse_utc(reg_raw_pub)
                except Exception:
                    reg_pub_dt = None

            gh_pub_dt = None
            if gh_raw_pub:
                try:
                    gh_pub_dt = _parse_utc(gh_raw_pub)
                except Exception:
                    gh_pub_dt = None

            expected_repo_lower = e.expected_repo.lower()

            reg_ok = (
                reg_kind == "200"
                and not reg_yanked
                and reg_pub_dt is not None
                and (start_dt <= reg_pub_dt <= end_dt)
                and (reg_repo == expected_repo_lower)
            )

            gh_ok = (
                gh_kind == "200"
                and not gh_draft
                and gh_tag == e.expected_tag
                and gh_pub_dt is not None
                and (start_dt <= gh_pub_dt <= end_dt)
                and (gh_repo == expected_repo_lower)
            )

            if reg_ok and gh_ok:
                e.match_reason = "VERIFIED_RELEASE"
                e.publish_time = reg_raw_pub
                e.yanked = False
                e.releaser = sender
                self._pay(Address(str(e.recipient)), e.amount)
                e.status = "RELEASED"
                e.payout = e.amount
                self.escrowed_open = self.escrowed_open - e.amount
                self.paid_to_recipients = self.paid_to_recipients + e.amount
                self.escrows[id] = e
                return

            if now_dt < end_dt:
                if reg_status == 404 and reg_kind == "404":
                    e.match_reason = "EARLY_404_RETRYABLE"
                elif gh_status == 404 and gh_kind == "404":
                    e.match_reason = "EARLY_GITHUB_404_RETRYABLE"
                elif reg_kind in ("unavailable", "oversize", "non-json", "inconclusive") or reg_status != 200:
                    e.match_reason = "EARLY_REGISTRY_UNAVAILABLE_RETRYABLE"
                elif gh_kind in ("unavailable", "oversize", "non-json", "inconclusive") or gh_status != 200:
                    e.match_reason = "EARLY_GITHUB_UNAVAILABLE_RETRYABLE"
                elif reg_repo != expected_repo_lower:
                    e.match_reason = "EARLY_REGISTRY_MISMATCH_RETRYABLE"
                elif gh_tag != e.expected_tag:
                    e.match_reason = "EARLY_GITHUB_TAG_MISMATCH_RETRYABLE"
                else:
                    e.match_reason = "EARLY_EVIDENCE_RETRYABLE"
                self.escrows[id] = e
                return

            # After window end (now_dt >= end_dt):
            reg_inconclusive = (
                reg_kind in ("unavailable", "oversize", "non-json", "inconclusive")
                or (reg_status not in (200, 404))
                or (reg_kind == "200" and not reg_yanked and reg_pub_dt is None)
            )
            gh_inconclusive = (
                gh_kind in ("unavailable", "oversize", "non-json", "inconclusive")
                or (gh_status not in (200, 404))
                or (gh_kind == "200" and gh_pub_dt is None)
            )

            if reg_inconclusive or gh_inconclusive:
                if reg_inconclusive and not gh_inconclusive:
                    e.match_reason = "POST_WINDOW_REGISTRY_UNAVAILABLE"
                elif gh_inconclusive and not reg_inconclusive:
                    e.match_reason = "POST_WINDOW_GITHUB_UNAVAILABLE"
                else:
                    e.match_reason = "POST_WINDOW_INSUFFICIENT_EVIDENCE"
                self.escrows[id] = e
                return

            is_reg_404 = (reg_status == 404 and reg_kind == "404") or (
                reg_status == 200 and reg_kind == "404" and reg_meta.get("error") == "version not published"
            )
            if is_reg_404:
                e.match_reason = "WINDOW_EXPIRED_NO_RELEASE"
            elif reg_yanked:
                e.match_reason = "YANKED"
                e.yanked = True
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif reg_pub_dt is not None and reg_pub_dt < start_dt:
                e.match_reason = "PUBLISHED_BEFORE_WINDOW"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif reg_pub_dt is not None and reg_pub_dt > end_dt:
                e.match_reason = "PUBLISHED_AFTER_WINDOW"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif reg_repo != expected_repo_lower:
                e.match_reason = "REGISTRY_REPO_MISMATCH"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif gh_status == 404 and gh_kind == "404":
                e.match_reason = "WINDOW_EXPIRED_GITHUB_NO_RELEASE"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif gh_tag != e.expected_tag or gh_kind == "mismatch":
                e.match_reason = "GITHUB_TAG_MISMATCH"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif gh_pub_dt is not None and gh_pub_dt < start_dt:
                e.match_reason = "GITHUB_RELEASE_BEFORE_WINDOW"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif gh_pub_dt is not None and gh_pub_dt > end_dt:
                e.match_reason = "GITHUB_RELEASE_AFTER_WINDOW"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            elif gh_repo != expected_repo_lower:
                e.match_reason = "GITHUB_REPO_MISMATCH"
                if reg_raw_pub: e.publish_time = reg_raw_pub
            else:
                e.match_reason = "WINDOW_EXPIRED_NO_RELEASE"
                if reg_raw_pub: e.publish_time = reg_raw_pub

            e.releaser = sender
            self._pay(Address(str(e.funder)), e.amount)
            e.status = "REFUND_NOHIT"
            e.refund = e.amount
            self.escrowed_open = self.escrowed_open - e.amount
            self.refunded_to_funders = self.refunded_to_funders + e.amount
            self.escrows[id] = e
            return

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
            "package": e.package_name,
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
            "policy": getattr(e, "policy", POLICY_REGISTRY_ONLY),
            "expected_repo": getattr(e, "expected_repo", ""),
            "expected_tag": getattr(e, "expected_tag", ""),
            "registry_evidence": getattr(e, "registry_evidence", ""),
            "github_evidence": getattr(e, "github_evidence", ""),
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
