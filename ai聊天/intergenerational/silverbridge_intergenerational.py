#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Silverbridge — 代际沟通模块
------------------------------------------------
功能概述：
  - 单一聊天入口：自动识别用户意图并返回对应回复
  - 需要改写时：老人 → 子女（温和委婉）/ 子女 → 老人（大白话）
  - 需要建议时：针对代际冲突给出分析与可执行步骤
  - 普通聊天时：自然连续对话，提供情感陪伴
  - 调用 DeepSeek Chat API，支持多轮上下文
  - 会话历史保存在内存中（重启后清空）

运行方式：
  python3 silverbridge_intergenerational.py

浏览器打开：
  http://127.0.0.1:8765/

依赖：仅 Python 3.8+ 标准库（urllib / http.server / json 等）
"""

from __future__ import annotations

import json
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# =============================================================================
# 配置区：请把下面的 API Key 换成你自己的（DeepSeek 控制台申请）
# =============================================================================
import os

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
# 官方文档：可与 OpenAI 兼容，使用 /v1 前缀（两种写法通常都可用；若遇 404 可切换另一行）
DEEPSEEK_API_URL = os.getenv("DEEPSEEK_URL", "https://api.deepseek.com/v1/chat/completions").strip()
# DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip()

# 本地 Web 服务监听地址
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 8765

# 会话历史最多保留多少条「用户+助手」消息对（防止上下文过长、费用过高）
MAX_HISTORY_TURNS = 30


# -----------------------------------------------------------------------------
# 系统提示词：单一入口自动选择「改写 / 建议 / 聊天」
# -----------------------------------------------------------------------------
SYSTEM_PROMPT_BASE = """你是 Silverbridge（银桥）产品中「代际沟通」模块的 AI 助手，面向中国大陆用户。
你的角色是两代人之间的温柔翻译官与沟通桥梁，语气始终尊重、耐心、不评判任何一方。
输出必须使用简体中文，禁止使用 Markdown 符号（例如 #、*、**、```）。"""

SYSTEM_PROMPT_AUTO = (
    SYSTEM_PROMPT_BASE
    + """
你需要在每轮对话中自动判断用户意图，并选择最合适的回复方式：

A. 改写型请求：
- 当用户明确表达“帮我改写/润色/怎么说/发给孩子(父母)”这类需求时，进入改写。
- 若方向是 elder_to_child：改写成给子女看的温和委婉表达。
- 若方向是 child_to_elder：改写成老人易懂的大白话表达。
- 只输出可直接发送的改写结果，不解释过程。

B. 解决方案型请求：
- 当用户在问“怎么办/如何解决/怎么沟通更好”等冲突处理问题时：
  1) 先用1-2句共情；
  2) 再给3-5条具体可执行步骤；
  3) 可补充1-2句可直接使用的话术。

C. 普通聊天型请求：
- 若用户只是倾诉、聊天、问近况，先自然聊天与陪伴；
- 如涉及代际沟通困难，再自然加入简短建议，不要生硬切换。

通用约束：
1. 始终温暖、尊重、易懂，不站队、不贴标签。
2. 不编造事实，不给医疗/法律确定性结论；遇到明显高风险，建议联系家人或专业机构。
3. 句子简洁，尽量口语化，适合60岁以上老人阅读。"""
)


def _build_messages_for_api(
    direction: str,
    history: List[Dict[str, str]],
    user_text: str,
) -> List[Dict[str, str]]:
    """组装发给 DeepSeek 的 messages：系统提示 + 历史 + 本轮用户输入。"""
    if direction not in ("elder_to_child", "child_to_elder"):
        raise ValueError("direction 必须是 elder_to_child 或 child_to_elder")

    system = (
        SYSTEM_PROMPT_AUTO
        + f"\n当前沟通方向参考：{direction}（仅在你判断为“改写型请求”时使用，不必在回复中重复）。"
    )

    messages: List[Dict[str, str]] = [{"role": "system", "content": system}]
    for item in history:
        messages.append({"role": item["role"], "content": item["content"]})
    messages.append({"role": "user", "content": user_text})
    return messages


def call_deepseek_chat(messages: List[Dict[str, str]]) -> str:
    """
    调用 DeepSeek Chat Completions API（OpenAI 兼容格式）。
    使用 urllib，无第三方 HTTP 库依赖。
    """
    if not DEEPSEEK_API_KEY:
        return (
            "【配置提示】未配置 DEEPSEEK_API_KEY。请在运行环境设置环境变量后重试。"
        )

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "stream": False,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        DEEPSEEK_API_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        },
    )
    try:
        with urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
    except HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace").strip()
        hint = ""
        if e.code == 404:
            hint = (
                "\n（404 多表示「请求的 URL 在对方服务器上不存在」：请检查 DEEPSEEK_API_URL 是否完整无误；"
                "若使用公司代理/校园网，可换手机热点试；也可在文件里改用另一行注释掉的官方地址。）"
            )
        return f"【API 错误】HTTP {e.code}  URL={DEEPSEEK_API_URL}\n{err_body}{hint}"
    except URLError as e:
        return f"【网络错误】{e.reason!s}"
    except Exception as e:  # noqa: BLE001 — 作业单文件里集中提示即可
        return f"【请求异常】{e!s}"

    try:
        data = json.loads(raw)
        return str(data["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return f"【解析失败】接口返回非预期格式：\n{raw[:2000]}"


# -----------------------------------------------------------------------------
# 会话存储（内存 + 线程锁）
# -----------------------------------------------------------------------------
_sessions_lock = threading.Lock()
# session_id -> {"direction": str, "history": [{"role","content"}, ...]}
_sessions: Dict[str, Dict[str, Any]] = {}


def _trim_history(history: List[Dict[str, str]], max_turns: int) -> None:
    """原地裁剪：保留最近 max_turns 轮 user+assistant（一轮 = 两条）。"""
    max_msgs = max_turns * 2
    while len(history) > max_msgs:
        history.pop(0)


def get_or_create_session(session_id: Optional[str], direction: str) -> str:
    """若未传 session_id 则新建；若传了但不存在也新建一个 id（容错）。"""
    with _sessions_lock:
        if session_id and session_id in _sessions:
            # 允许切换方向（简单处理：以最新请求为准）
            _sessions[session_id]["direction"] = direction
            return session_id
        new_id = session_id or uuid.uuid4().hex[:16]
        while new_id in _sessions:
            new_id = uuid.uuid4().hex[:16]
        _sessions[new_id] = {"direction": direction, "history": []}
        return new_id


def append_turn(session_id: str, user_text: str, assistant_text: str) -> None:
    with _sessions_lock:
        if session_id not in _sessions:
            return
        h = _sessions[session_id]["history"]
        h.append({"role": "user", "content": user_text})
        h.append({"role": "assistant", "content": assistant_text})
        _trim_history(h, MAX_HISTORY_TURNS)


def get_history(session_id: str) -> List[Dict[str, str]]:
    with _sessions_lock:
        if session_id not in _sessions:
            return []
        return list(_sessions[session_id]["history"])


def clear_session(session_id: str) -> bool:
    with _sessions_lock:
        if session_id not in _sessions:
            return False
        _sessions[session_id]["history"] = []
        return True


# -----------------------------------------------------------------------------
# HTTP 层：REST JSON + 根路径简易测试页
# -----------------------------------------------------------------------------
def _read_json_body(handler: BaseHTTPRequestHandler) -> Any:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return None
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return None


def _send_json(handler: BaseHTTPRequestHandler, status: int, obj: Any) -> None:
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(data)


def _send_html(handler: BaseHTTPRequestHandler, status: int, html: str) -> None:
    data = html.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


# 内嵌测试页：单文件即可在浏览器验收
TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Silverbridge 代际沟通 — 测试页</title>
  <style>
    :root { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
    body { max-width: 720px; margin: 24px auto; padding: 0 16px; color: #222; }
    h1 { font-size: 1.25rem; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    textarea, select, button { width: 100%; box-sizing: border-box; font-size: 1rem; }
    textarea { min-height: 100px; padding: 8px; margin-top: 4px; }
    button { margin-top: 12px; padding: 10px; cursor: pointer; }
    #out { white-space: pre-wrap; background: #f6f7f9; padding: 12px; border-radius: 8px;
            margin-top: 16px; min-height: 80px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .row button { width: auto; flex: 1; min-width: 120px; }
    code { background: #eee; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Silverbridge · 代际沟通（测试页）</h1>
  <p>单一聊天入口：系统会自动判断你是在「要改写」「要建议」还是「普通聊天」。会话 ID 会显示在下方，可用于连续对话。</p>

  <label for="direction">沟通方向偏好（仅在改写类请求时生效）</label>
  <select id="direction">
    <option value="elder_to_child">老人 → 子女（温和委婉）</option>
    <option value="child_to_elder">子女 → 老人（大白话）</option>
  </select>

  <label for="sid">会话 ID（可留空新建；多轮对话请保持不变）</label>
  <textarea id="sid" rows="1" placeholder="留空则每次「发送」会新建会话；要连续对话请固定填写同一个 ID"></textarea>

  <label for="msg">输入内容</label>
  <textarea id="msg" placeholder="例如：我跟子女吵架了，他们说我别管他们的闲事，我该怎么办？"></textarea>

  <button type="button" id="send">发送请求</button>
  <div class="row">
    <button type="button" id="hist">拉取当前会话历史</button>
    <button type="button" id="clear">清空当前会话历史</button>
  </div>

  <label for="out">结果</label>
  <div id="out"></div>

  <p style="font-size:0.9rem;color:#555;">接口示例：<code>POST /api/chat</code> JSON 字段
    <code>direction</code>、<code>message</code>、可选 <code>session_id</code>；
    <code>GET /api/history?session_id=...</code>；
    <code>POST /api/clear</code> body <code>{"session_id":"..."}</code>。</p>

  <script>
    const $ = (id) => document.getElementById(id);
    const out = $("out");

    async function postJson(url, body) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const t = await r.text();
      try { return { ok: r.ok, data: JSON.parse(t) }; }
      catch { return { ok: r.ok, data: t }; }
    }

    $("send").onclick = async () => {
      out.textContent = "请求中…";
      const direction = $("direction").value;
      const message = $("msg").value.trim();
      const session_id = $("sid").value.trim() || null;
      if (!message) { out.textContent = "请先输入内容。"; return; }
      const { ok, data } = await postJson("/api/chat", { direction, message, session_id });
      if (!ok) { out.textContent = "错误：\\n" + (typeof data === "string" ? data : JSON.stringify(data, null, 2)); return; }
      out.textContent = data.reply || JSON.stringify(data, null, 2);
      if (data.session_id) $("sid").value = data.session_id;
    };

    $("hist").onclick = async () => {
      const session_id = $("sid").value.trim();
      if (!session_id) { out.textContent = "请先填写会话 ID（发送一次后会自动填入）。"; return; }
      out.textContent = "请求中…";
      const r = await fetch("/api/history?session_id=" + encodeURIComponent(session_id));
      const data = await r.json();
      out.textContent = JSON.stringify(data, null, 2);
    };

    $("clear").onclick = async () => {
      const session_id = $("sid").value.trim();
      if (!session_id) { out.textContent = "请先填写会话 ID。"; return; }
      out.textContent = "请求中…";
      const { ok, data } = await postJson("/api/clear", { session_id });
      out.textContent = JSON.stringify(data, null, 2);
    };
  </script>
</body>
</html>
"""


class AppHandler(BaseHTTPRequestHandler):
    """极简路由：GET / 测试页；POST /api/chat；GET /api/history；POST /api/clear。"""

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        # 控制台打印精简一点，方便作业演示
        print(f"[HTTP] {args[0]} {args[1]}")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/" or self.path.startswith("/?"):
            _send_html(self, 200, TEST_PAGE_HTML)
            return
        if self.path.startswith("/api/history"):
            qs = self.path.split("?", 1)[1] if "?" in self.path else ""
            params = dict(
                p.split("=", 1) for p in qs.split("&") if "=" in p
            ) if qs else {}
            sid = params.get("session_id", "")
            if not sid:
                _send_json(self, 400, {"error": "缺少 session_id"})
                return
            _send_json(
                self,
                200,
                {"session_id": sid, "history": get_history(sid)},
            )
            return
        self.send_error(404, "Not Found")

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/chat":
            body = _read_json_body(self)
            if not isinstance(body, dict):
                _send_json(self, 400, {"error": "JSON 格式错误"})
                return
            direction = str(body.get("direction") or "elder_to_child").strip()
            message = (body.get("message") or "").strip()
            session_id_in = body.get("session_id")
            if session_id_in is not None:
                session_id_in = str(session_id_in).strip() or None

            if direction not in ("elder_to_child", "child_to_elder"):
                _send_json(self, 400, {"error": "direction 无效（应为 elder_to_child/child_to_elder）"})
                return
            if not message:
                _send_json(self, 400, {"error": "message 不能为空"})
                return

            sid = get_or_create_session(session_id_in, direction)
            # 取历史（不含本轮）
            prior = get_history(sid)
            messages = _build_messages_for_api(direction, prior, message)
            reply = call_deepseek_chat(messages)
            append_turn(sid, message, reply)
            _send_json(
                self,
                200,
                {"session_id": sid, "direction": direction, "reply": reply},
            )
            return

        if self.path == "/api/clear":
            body = _read_json_body(self)
            if not isinstance(body, dict):
                _send_json(self, 400, {"error": "JSON 格式错误"})
                return
            sid = str(body.get("session_id") or "").strip()
            if not sid:
                _send_json(self, 400, {"error": "缺少 session_id"})
                return
            ok = clear_session(sid)
            _send_json(self, 200, {"session_id": sid, "cleared": ok})
            return

        self.send_error(404, "Not Found")


def main() -> None:
    server = HTTPServer((LISTEN_HOST, LISTEN_PORT), AppHandler)
    print("Silverbridge 代际沟通服务已启动。")
    print(f"  浏览器打开: http://{LISTEN_HOST}:{LISTEN_PORT}/")
    print("  按 Ctrl+C 停止服务。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
