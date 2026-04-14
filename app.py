from __future__ import annotations

import base64
import io

from flask import Flask, jsonify, render_template, request
import os
import sys
import importlib.util
from typing import Optional, Tuple

try:
    # Load local .env for development (Vercel uses environment variables directly).
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=False)
except Exception:
    pass


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25MB


@app.get("/")
def index():
    contacts = [
        # 家人
        {"name": "儿子", "category": "family", "time": "20:20", "active": True, "last_message": ""},
        {"name": "女儿", "category": "family", "time": "19:40", "active": False, "last_message": ""},
        {"name": "老伴", "category": "family", "time": "18:05", "active": False, "last_message": ""},
        {"name": "孙子", "category": "family", "time": "17:22", "active": False, "last_message": ""},
        {"name": "孙女", "category": "family", "time": "16:50", "active": False, "last_message": ""},
        {"name": "大哥", "category": "family", "time": "15:18", "active": False, "last_message": ""},
        {"name": "二哥", "category": "family", "time": "14:30", "active": False, "last_message": ""},
        {"name": "亲家公", "category": "family", "time": "13:12", "active": False, "last_message": ""},
        {"name": "亲家母", "category": "family", "time": "12:05", "active": False, "last_message": ""},
        # 朋友
        {"name": "小李", "category": "friends", "time": "20:10", "active": False, "last_message": ""},
        {"name": "小郑", "category": "friends", "time": "19:55", "active": False, "last_message": ""},
        {"name": "小冯", "category": "friends", "time": "19:20", "active": False, "last_message": ""},
        {"name": "小吴", "category": "friends", "time": "18:48", "active": False, "last_message": ""},
        {"name": "小尹", "category": "friends", "time": "18:10", "active": False, "last_message": ""},
        # 群聊
        {"name": "社区老人关爱群", "category": "groups", "time": "20:12", "active": False, "last_message": ""},
        {"name": "社区老人服务群", "category": "groups", "time": "19:58", "active": False, "last_message": ""},
        {"name": "多多买菜组团群", "category": "groups", "time": "19:30", "active": False, "last_message": ""},
        {"name": "社区老人健身群", "category": "groups", "time": "18:36", "active": False, "last_message": ""},
        {"name": "社区老人活动群", "category": "groups", "time": "18:02", "active": False, "last_message": ""},
        # 服务
        {"name": "社区买菜 送货上门", "category": "services", "time": "20:05", "active": False, "last_message": ""},
        {"name": "上门按摩", "category": "services", "time": "19:10", "active": False, "last_message": ""},
        {"name": "社区医生上门问诊", "category": "services", "time": "18:20", "active": False, "last_message": ""},
    ]

    features = [
        {"name": "与小乔聊天", "meta": "和我聊聊吧～"},
        {"name": "健康咨询", "meta": "身体不舒服 先问问小乔～"},
        {"name": "诈骗识别", "meta": "怀疑是骗子？我来帮你识别！"},
        {"name": "代际沟通", "meta": "和晚辈吵架了？找我排忧解难～"},
    ]

    bubbles = [
        {
            "side": "left",
            "title": "老年人智能情绪+会诊综合调查",
            "sub": "",
        },
        {
            "side": "left",
            "title": "老年人辅助跌倒风险评估与异常体征仪表盘，已立即提醒。",
            "sub": "",
        },
        {
            "side": "right",
            "title": "一人回访日，三位常住人群建议复查。",
            "sub": "",
        },
        {
            "side": "left",
            "title": "综上建议：增加陪伴与康复训练频次，保持稳定作息。",
            "sub": "",
        },
    ]

    return render_template(
        "index.html",
        contacts=contacts,
        features=features,
        bubbles=bubbles,
    )


@app.post("/api/stt")
def api_stt():
    """
    Speech-to-text endpoint.
    Expects multipart/form-data with file field: audio (WAV recommended).
    Returns: { ok: true, text: "..." } or { ok: false, error: "..." }
    """
    f = request.files.get("audio")
    if not f:
        return jsonify(ok=False, error="缺少音频文件(audio)"), 400

    try:
        np = __import__("numpy")
        sf = __import__("soundfile")
    except Exception:
        return jsonify(ok=False, error="服务端缺少音频依赖，请先安装 requirements.txt"), 501

    data = f.read()
    if not data:
        return jsonify(ok=False, error="音频为空"), 400

    try:
        audio, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
    except Exception:
        return jsonify(ok=False, error="无法解析音频（建议使用 WAV 格式）"), 400

    if isinstance(audio, np.ndarray) and audio.ndim == 2:
        audio = audio.mean(axis=1)

    if sr != 16000:
        return jsonify(ok=False, error=f"采样率必须为16kHz（当前{sr}Hz）"), 400

    try:
        from stt_whisper import transcribe_audio

        r = transcribe_audio(audio)
        if not r.text:
            return jsonify(ok=True, text="")
        return jsonify(ok=True, text=r.text)
    except Exception:
        return jsonify(ok=False, error="语音识别失败，请稍后重试"), 500


@app.post("/api/anti_fraud/chat")
def api_anti_fraud_chat():
    """
    Anti-fraud chat endpoint.
    Input JSON: { text: "...", image_base64?: "data:image/png;base64,..." }
    Output: { ok: true, reply_text: "...", risk_level: "...", is_scam: "..." }
    """
    payload = {}
    try:
        payload = request.get_json(silent=True) or {}
        text = str(payload.get("text", "") or "")
    except Exception:
        text = ""

    image_bytes = None
    raw_b64 = payload.get("image_base64") or payload.get("imageBase64")
    if raw_b64:
        s = str(raw_b64).strip()
        if "," in s and s.lower().startswith("data:"):
            s = s.split(",", 1)[1]
        try:
            image_bytes = base64.b64decode(s, validate=False)
        except Exception:
            image_bytes = None
    if image_bytes is not None and len(image_bytes) > 12 * 1024 * 1024:
        image_bytes = None

    try:
        from anti_fraud_engine import analyze

        r = analyze(text, image_bytes=image_bytes)
        return jsonify(ok=True, reply_text=r.reply_text, risk_level=r.risk_level, is_scam=r.is_scam)
    except Exception:
        return jsonify(ok=False, error="反诈分析服务暂时不可用"), 500


def _get_phone_scam_module():
    """
    Lazy-load the phone scam LLM pipeline (ai聊天/反诈/诈骗电话识别.py).
    This module includes OCR + speech + LLM + DB matching. We only call its check_audio() here.
    """
    if not hasattr(_get_phone_scam_module, "_mod"):
        base = os.path.join(os.path.dirname(__file__), "ai聊天", "反诈")
        mod_path = os.path.join(base, "诈骗电话识别.py")
        spec = importlib.util.spec_from_file_location("anti_scam_phone_pipeline", mod_path)
        if not spec or not spec.loader:
            raise RuntimeError("无法加载诈骗电话识别模块")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = mod
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        _get_phone_scam_module._mod = mod  # type: ignore[attr-defined]
    return _get_phone_scam_module._mod  # type: ignore[attr-defined]


def _guess_audio_format(filename: str, mime: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower().lstrip(".")
    if ext:
        return ext
    mt = (mime or "").lower()
    if "wav" in mt:
        return "wav"
    if "mpeg" in mt or "mp3" in mt:
        return "mp3"
    if "amr" in mt:
        return "amr"
    if "mp4" in mt:
        return "mp4"
    if "m4a" in mt:
        return "m4a"
    return "wav"


def _maybe_convert_to_wav(audio_bytes: bytes, fmt: str) -> Tuple[bytes, str]:
    """
    Convert mp4/m4a (or other non-baidu formats) to wav bytes if possible.
    Requires pydub + ffmpeg installed locally.
    Returns (bytes, fmt) where fmt is the suggested pipeline format.
    """
    fmt = (fmt or "").lower()
    if fmt in {"wav", "mp3", "pcm", "amr"}:
        return audio_bytes, fmt
    if fmt in {"m4a", "mp4"}:
        # Vercel Serverless 环境通常没有 ffmpeg，无法进行转码
        if os.getenv("VERCEL"):
            raise RuntimeError("Vercel 暂不支持 mp4/m4a 录音：请上传 wav/mp3/amr 格式。")
        try:
            from pydub import AudioSegment  # type: ignore
        except Exception:
            raise RuntimeError("暂不支持 mp4/m4a：请先安装 pydub，并在本机安装 ffmpeg。")
        try:
            seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
            seg = seg.set_channels(1).set_frame_rate(16000)
            out = io.BytesIO()
            seg.export(out, format="wav")
            return out.getvalue(), "wav"
        except Exception:
            raise RuntimeError("无法解析该音频/视频文件（mp4/m4a 需要 ffmpeg 支持）。")
    # Unknown: fallback as wav
    return audio_bytes, "wav"


def _local_whisper_transcribe_wav_bytes(wav_bytes: bytes) -> str:
    """
    Local fallback STT using stt_whisper + faster-whisper.
    Only supports WAV bytes (decoded by soundfile). This is used when Baidu ASR isn't available.
    """
    try:
        import numpy as np  # type: ignore
        import soundfile as sf  # type: ignore
    except Exception as e:
        raise RuntimeError(f"缺少音频依赖（numpy/soundfile）：{e}")
    try:
        from stt_whisper import transcribe_audio
    except Exception as e:
        raise RuntimeError(f"未启用本地语音识别（stt_whisper/faster-whisper）：{e}")

    audio, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32", always_2d=False)
    if isinstance(audio, np.ndarray) and audio.ndim == 2:
        audio = audio.mean(axis=1)
    if not isinstance(audio, np.ndarray):
        audio = np.array(audio, dtype=np.float32)

    # Resample to 16k if needed
    target_sr = 16000
    if int(sr) != target_sr:
        n = int(round(len(audio) * (target_sr / float(sr))))
        if n <= 1:
            raise RuntimeError("音频过短，无法重采样")
        x_old = np.linspace(0.0, 1.0, num=len(audio), endpoint=False, dtype=np.float32)
        x_new = np.linspace(0.0, 1.0, num=n, endpoint=False, dtype=np.float32)
        audio = np.interp(x_new, x_old, audio).astype(np.float32)

    r = transcribe_audio(audio)
    return str(getattr(r, "text", "") or "").strip()


@app.post("/api/anti_fraud/audio")
def api_anti_fraud_audio():
    """
    Anti-fraud audio endpoint (LLM pipeline route).
    Expects multipart/form-data with file field: audio (wav/mp3/amr/m4a/mp4...).
    Optional field: text (additional context).
    Output: { ok: true, reply_text: "..." }
    """
    f = request.files.get("audio") or request.files.get("file")
    if not f:
        return jsonify(ok=False, error="缺少音频文件(audio)"), 400
    raw = f.read()
    if not raw:
        return jsonify(ok=False, error="音频为空"), 400
    if len(raw) > 22 * 1024 * 1024:
        return jsonify(ok=False, error="文件过大（请上传 22MB 以内）"), 413

    fmt = _guess_audio_format(f.filename or "", f.mimetype or "")
    try:
        audio_bytes, use_fmt = _maybe_convert_to_wav(raw, fmt)
    except Exception as e:
        return jsonify(ok=False, error=str(e) or "音频格式不支持"), 400

    # If user also typed some context, prepend it (pipeline expects one input at a time)
    extra_text = str(request.form.get("text", "") or "").strip()
    try:
        mod = _get_phone_scam_module()
        check_audio = getattr(mod, "check_audio", None)
        check_message = getattr(mod, "check_message", None)
        if not callable(check_audio):
            raise RuntimeError("诈骗电话识别模块缺少 check_audio()")

        # If Baidu ASR isn't available, fallback to local Whisper STT -> check_message.
        speech_client = getattr(mod, "speech_client", None)
        used_check_message = False
        # Vercel 上不启用本地 Whisper（依赖重、冷启动慢、容易超时）
        if os.getenv("VERCEL") and not speech_client:
            raise RuntimeError(
                "语音识别暂不可用：Vercel 环境不支持本地 Whisper 降级。\n"
                "请在 Vercel 环境变量配置百度语音识别：SPEECH_APP_ID、SPEECH_API_KEY、SPEECH_SECRET_KEY，"
                "并上传 wav/mp3/amr 格式音频。"
            )
        if (not speech_client) and callable(check_message) and use_fmt == "wav":
            stt_text = _local_whisper_transcribe_wav_bytes(audio_bytes)
            merged = "\n".join([x for x in [stt_text, extra_text] if x]).strip()
            if not merged:
                raise RuntimeError("语音识别失败：未提取到文字（可尝试更清晰的录音或直接输入文字）")
            reply = check_message(merged)
            used_check_message = True
        else:
            reply = check_audio(audio_bytes=audio_bytes, audio_format=use_fmt)
        # Avoid double LLM calls: if we already used check_message(转写+补充) above,
        # do not run a second check_message(extra_text).
        if (not used_check_message) and extra_text:
            reply = f"{reply}\n\n（您补充的信息）\n{extra_text}".strip()
        return jsonify(ok=True, reply_text=str(reply or "").strip())
    except Exception as e:
        try:
            print(f"[anti_fraud_audio] error: {e}")
        except Exception:
            pass
        msg = str(e) if e else ""
        if msg:
            msg = msg.strip()
        return jsonify(ok=False, error=(msg or "反诈音频识别暂时不可用")), 500


def _get_health_engine():
    """
    Lazy-load the embedded health consultation engine.
    Kept import-safe: the original Health_Consultation scripts are standalone servers.
    """
    if not hasattr(_get_health_engine, "_engine"):
        hc_dir = os.path.join(os.path.dirname(__file__), "ai聊天", "Health_Consultation")
        mod_path = os.path.join(hc_dir, "engine_embed.py")
        spec = importlib.util.spec_from_file_location("health_engine_embed", mod_path)
        if not spec or not spec.loader:
            raise RuntimeError("无法加载健康咨询模块")
        mod = importlib.util.module_from_spec(spec)
        # dataclasses relies on sys.modules[__module__] during class creation
        sys.modules[spec.name] = mod
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        cls = getattr(mod, "HealthConsultationEngineEmbed", None)
        if not cls:
            raise RuntimeError("健康咨询模块缺少入口类")
        _get_health_engine._engine = cls()  # type: ignore[attr-defined]
    return _get_health_engine._engine  # type: ignore[attr-defined]


@app.post("/api/health/chat")
def api_health_chat():
    """
    Health consultation chat endpoint (embedded from ai聊天/Health_Consultation).
    Input JSON: { text: "...", user_id?: "..." }
    Output: { ok: true, reply_text: "..." }
    """
    payload = {}
    try:
        payload = request.get_json(silent=True) or {}
        text = str(payload.get("text", "") or "")
        user_id = str(payload.get("user_id", "") or "").strip() or "guest"
    except Exception:
        text = ""
        user_id = "guest"

    if not text.strip():
        return jsonify(ok=False, error="内容不能为空"), 400

    try:
        engine = _get_health_engine()
        r = engine.chat(user_id=user_id, message=text)
        data = (r or {}).get("data") if isinstance(r, dict) else None
        if not isinstance(data, dict):
            return jsonify(ok=False, error="健康咨询服务返回异常"), 500
        reply_text = "\n".join(
            [str(data.get("simple_reply") or "").strip(), str(data.get("full_reply") or "").strip(), str(data.get("risk_warning") or "").strip()]
        ).strip()
        return jsonify(ok=True, reply_text=reply_text)
    except Exception:
        return jsonify(ok=False, error="健康咨询服务暂时不可用"), 500


def _get_daily_engine():
    """
    Lazy-load the embedded daily chat engine (ai聊天/日常).
    """
    if not hasattr(_get_daily_engine, "_engine"):
        d_dir = os.path.join(os.path.dirname(__file__), "ai聊天", "日常")
        mod_path = os.path.join(d_dir, "engine_embed.py")
        spec = importlib.util.spec_from_file_location("daily_engine_embed", mod_path)
        if not spec or not spec.loader:
            raise RuntimeError("无法加载日常聊天模块")
        mod = importlib.util.module_from_spec(spec)
        # dataclasses relies on sys.modules[__module__] during class creation
        sys.modules[spec.name] = mod
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        cls = getattr(mod, "DailyChatEngineEmbed", None)
        if not cls:
            raise RuntimeError("日常聊天模块缺少入口类")
        _get_daily_engine._engine = cls()  # type: ignore[attr-defined]
    return _get_daily_engine._engine  # type: ignore[attr-defined]


def _get_intergen_engine():
    """
    Lazy-load the embedded intergenerational engine (ai聊天/intergenerational).
    """
    if not hasattr(_get_intergen_engine, "_engine"):
        d_dir = os.path.join(os.path.dirname(__file__), "ai聊天", "intergenerational")
        mod_path = os.path.join(d_dir, "engine_embed.py")
        spec = importlib.util.spec_from_file_location("intergen_engine_embed", mod_path)
        if not spec or not spec.loader:
            raise RuntimeError("无法加载代际沟通模块")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = mod
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        cls = getattr(mod, "IntergenerationalEngineEmbed", None)
        if not cls:
            raise RuntimeError("代际沟通模块缺少入口类")
        _get_intergen_engine._engine = cls()  # type: ignore[attr-defined]
    return _get_intergen_engine._engine  # type: ignore[attr-defined]


@app.post("/api/intergenerational/chat")
def api_intergenerational_chat():
    """
    Intergenerational chat endpoint (embedded from ai聊天/intergenerational).
    Input JSON: { text: "...", user_id?: "...", direction?: "elder_to_child"|"child_to_elder" }
    Output: { ok: true, reply_text: "..." }
    """
    payload = {}
    try:
        payload = request.get_json(silent=True) or {}
        text = str(payload.get("text", "") or "")
        user_id = str(payload.get("user_id", "") or "").strip() or "guest"
        direction = str(payload.get("direction", "") or "").strip() or "elder_to_child"
    except Exception:
        text = ""
        user_id = "guest"
        direction = "elder_to_child"

    if not text.strip():
        return jsonify(ok=False, error="内容不能为空"), 400

    try:
        engine = _get_intergen_engine()
        r = engine.chat(user_id=user_id, message=text, direction=direction)
        data = (r or {}).get("data") if isinstance(r, dict) else None
        if not isinstance(data, dict):
            return jsonify(ok=False, error="代际沟通服务返回异常"), 500
        reply_text = str(data.get("reply_text") or "").strip() or "我在呢。您愿意的话，先说说发生了什么？"
        return jsonify(ok=True, reply_text=reply_text)
    except Exception as e:
        try:
            print(f"[intergen] error: {e}")
        except Exception:
            pass
        return jsonify(ok=False, error="代际沟通服务暂时不可用"), 500


@app.post("/api/daily/chat")
def api_daily_chat():
    """
    Daily chat endpoint (embedded from ai聊天/日常).
    Input JSON: { text: "...", user_id?: "..." }
    Output: { ok: true, reply_text: "..." }
    """
    payload = {}
    try:
        payload = request.get_json(silent=True) or {}
        text = str(payload.get("text", "") or "")
        user_id = str(payload.get("user_id", "") or "").strip() or "guest"
    except Exception:
        text = ""
        user_id = "guest"

    if not text.strip():
        return jsonify(ok=False, error="内容不能为空"), 400

    try:
        engine = _get_daily_engine()
        r = engine.chat(user_id=user_id, message=text)
        data = (r or {}).get("data") if isinstance(r, dict) else None
        if not isinstance(data, dict):
            return jsonify(ok=False, error="日常聊天服务返回异常"), 500
        reply_text = str(data.get("reply_text") or "").strip()
        if not reply_text:
            reply_text = "我在呢，您慢慢说。"
        return jsonify(ok=True, reply_text=reply_text, emotion_tag=data.get("emotion_tag"), quick_replies=data.get("quick_replies"))
    except Exception as e:
        try:
            print(f"[daily] error: {e}")
        except Exception:
            pass
        return jsonify(ok=False, error=f"日常聊天服务暂时不可用：{e}"), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)

