"""
Embed-friendly Intergenerational Communication engine.

Safe to import from the main Flask app (no standalone server).
Uses project-root .env: DEEPSEEK_API_KEY.
"""

from __future__ import annotations

import json
import os
import re
import threading
from typing import Any, Dict, List, Optional


def _load_env_file(path: str) -> None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f.readlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        return


try:
    from dotenv import load_dotenv  # type: ignore
except Exception:
    load_dotenv = None


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


class IntergenerationalEngineEmbed:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.deepseek.com/v1",
        model: str = "deepseek-chat",
        max_turns: int = 20,
    ) -> None:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        env_path = os.path.join(root_dir, ".env")
        if load_dotenv:
            try:
                load_dotenv(env_path, override=False)
            except Exception:
                _load_env_file(env_path)
        else:
            _load_env_file(env_path)

        self.api_key = (api_key if api_key is not None else os.getenv("DEEPSEEK_API_KEY", "")).strip()
        self.base_url = base_url
        self.model = model
        self.max_turns = max(5, int(max_turns))
        self._lock = threading.Lock()
        self._hist: Dict[str, List[Dict[str, str]]] = {}

    def _trim(self, h: List[Dict[str, str]]) -> None:
        max_msgs = self.max_turns * 2
        while len(h) > max_msgs:
            h.pop(0)

    def _clean(self, s: str) -> str:
        s = (s or "").strip()
        s = s.replace("\r\n", "\n")
        s = re.sub(r"\n+", "\n", s)
        return s

    def chat(self, user_id: str, message: str, direction: str = "elder_to_child") -> Dict[str, Any]:
        uid = (user_id or "guest").strip() or "guest"
        msg = self._clean(message)
        if not msg:
            return {"ok": True, "data": {"reply_text": "您先把想说的话写出来，我帮您说得更温和、更清楚。"}}
        if not self.api_key:
            return {"ok": True, "data": {"reply_text": "代际沟通服务未配置密钥，请稍后再试。"}}

        if direction not in ("elder_to_child", "child_to_elder"):
            direction = "elder_to_child"

        with self._lock:
            hist = list(self._hist.get(uid, []))

        system = SYSTEM_PROMPT_AUTO + f"\n当前沟通方向参考：{direction}（仅在你判断为改写型请求时使用，不必在回复中重复）。"
        messages: List[Dict[str, str]] = [{"role": "system", "content": system}] + hist + [{"role": "user", "content": msg}]

        # Prefer OpenAI SDK; fallback to raw HTTP.
        content = None
        try:
            import openai  # type: ignore

            client = openai.OpenAI(api_key=self.api_key, base_url=self.base_url)
            resp = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=600,
            )
            content = (resp.choices[0].message.content or "").strip()
        except Exception:
            try:
                import requests  # type: ignore

                url = self.base_url.rstrip("/") + "/chat/completions"
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 600,
                }
                res = requests.post(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                    timeout=25,
                )
                if res.status_code == 401:
                    return {"ok": True, "data": {"reply_text": "代际沟通服务 API Key 无效，请更新后再试。"}}
                if not res.ok:
                    return {"ok": True, "data": {"reply_text": f"代际沟通服务暂时不可用（HTTP {res.status_code}）。"}}
                data = res.json() if res.content else {}
                content = (
                    (((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content")
                )
                content = (str(content or "")).strip()
            except Exception:
                content = ""

        reply = content or "我在呢。您愿意的话，先说说发生了什么、您最在意的点是什么？"

        with self._lock:
            h2 = self._hist.get(uid, [])
            h2.append({"role": "user", "content": msg})
            h2.append({"role": "assistant", "content": reply})
            self._trim(h2)
            self._hist[uid] = h2

        return {"ok": True, "data": {"reply_text": reply}}

