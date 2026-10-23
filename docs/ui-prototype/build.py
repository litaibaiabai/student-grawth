"""Bundle the UI design into a portable HTML file; no third-party dependencies."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
css = (ROOT / "style.css").read_text(encoding="utf-8")
js = (ROOT / "app.js").read_text(encoding="utf-8")
assert "</script" not in js.lower(), "Escape closing script tags before bundling."
html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="description" content="六育学生评价系统全模块界面设计，包含学生、教师、管理员31个演示视图。">
<title>六育 · 学生成长评价</title>
<style>{css}</style>
</head>
<body><div id="app"></div><div id="modal-root"></div>
<script>{js}</script>
</body>
</html>'''
(ROOT / "index.html").write_text(html, encoding="utf-8")
print(f"Built {ROOT / 'index.html'} ({len(html.encode('utf-8')):,} bytes)")
