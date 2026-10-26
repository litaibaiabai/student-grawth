#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_demo_files.py
用于生成“六育学生评价系统”全流程闭环演示所需的物料文件：
1. 01_演示账号与操作清单 (xlsx, csv)
2. 02_期末文化课成绩导入表_示例 (xlsx, csv, json)
3. 03_六育主观维度终测评分导入表_示例 (xlsx, csv, json)
4. 04_六育防伪实体激励卡_A4打印样张.html
5. 05_学生荣誉奖项证明材料_示例.png
"""

import os
import zipfile
import json
import zlib
import struct
import io

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

def create_simple_xlsx(filename, sheet_name, headers, rows):
    """
    使用 Python 标准库生成标准的 ECMA-376 / OpenXML .xlsx 文件，
    兼容 Microsoft Excel、WPS Office 与各类电子表格软件。
    """
    def col_letter(col_idx):
        result = ""
        while col_idx >= 0:
            result = chr(col_idx % 26 + 65) + result
            col_idx = col_idx // 26 - 1
        return result

    # 1. 构建 sheet xml
    sheet_xml_lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '  <sheetData>'
    ]
    
    # 写入表头 (row 1)
    sheet_xml_lines.append('    <row r="1">')
    for c_idx, h in enumerate(headers):
        cell_ref = f"{col_letter(c_idx)}1"
        sheet_xml_lines.append(f'      <c r="{cell_ref}" t="inlineStr"><is><t>{h}</t></is></c>')
    sheet_xml_lines.append('    </row>')

    # 写入行数据 (row 2..N)
    for r_idx, row in enumerate(rows, start=2):
        sheet_xml_lines.append(f'    <row r="{r_idx}">')
        for c_idx, val in enumerate(row):
            cell_ref = f"{col_letter(c_idx)}{r_idx}"
            if isinstance(val, (int, float)):
                sheet_xml_lines.append(f'      <c r="{cell_ref}"><v>{val}</v></c>')
            else:
                str_val = str(val).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                sheet_xml_lines.append(f'      <c r="{cell_ref}" t="inlineStr"><is><t>{str_val}</t></is></c>')
        sheet_xml_lines.append('    </row>')

    sheet_xml_lines.append('  </sheetData>')
    sheet_xml_lines.append('</worksheet>')
    sheet_xml = "\n".join(sheet_xml_lines)

    # 2. 构建 workbook.xml
    workbook_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="{sheet_name}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>'''

    # 3. 构建 _rels/.rels
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

    # 4. 构建 xl/_rels/workbook.xml.rels
    workbook_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>'''

    # 5. 构建 [Content_Types].xml
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>'''

    # 打包为 zip
    filepath = os.path.join(OUTPUT_DIR, filename)
    with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)

    print(f"✅ 生成 Excel: {filepath}")

def create_csv(filename, headers, rows):
    """生成带 UTF-8 BOM 的 CSV 文件，双击在 Excel 中打开绝不乱码"""
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, "w", encoding="utf-8-sig") as f:
        f.write(",".join(headers) + "\n")
        for row in rows:
            f.write(",".join(str(v) for v in row) + "\n")
    print(f"✅ 生成 CSV: {filepath}")

def generate_accounts_file():
    headers = ["角色标识", "角色名称", "登录账号", "初始密码", "真实姓名", "所辖班级/学籍信息", "核心演示职责"]
    rows = [
        ["manager", "学校管理员", "admin", "admin123", "系统管理员", "全校", "学期配置、规则引擎、防伪实体卡生成、维度成绩导入、期末报告批量发布与审计"],
        ["teacher", "任课教师/班主任", "teacher1", "123456", "张老师", "四年级（1）班、四年级（2）班", "工作台待办总览、随堂无卡直评、扫卡申领审核、生活故事终审打分、荣誉材料认定、学科成绩录入"],
        ["teacher", "任课教师", "teacher2", "123456", "李老师", "五年级（1）班", "跨班级学科教学、协同无卡直评"],
        ["student", "在读学生", "student1", "123456", "王小明", "四年级（1）班", "六育过程账本查阅、实体卡防伪申领、月度生活故事写作提交、个人荣誉证明申报、学期素质发展报告查阅打印"],
        ["student", "在读学生", "student2", "123456", "李小华", "四年级（2）班", "平行班学生对比、扫卡申领流程测试"],
        ["student", "在读学生", "student3", "123456", "赵小敏", "五年级（1）班", "高年级学生评价对照"]
    ]
    create_simple_xlsx("01_演示账号与操作清单.xlsx", "演示账号与操作清单", headers, rows)
    create_csv("01_演示账号与操作清单.csv", headers, rows)

def generate_subject_scores_file():
    headers = ["studentId", "username", "studentName", "subjectCode", "subjectName", "score"]
    rows = [
        [4, "student1", "王小明", "CHINESE", "语文", 94.5],
        [4, "student1", "王小明", "MATH", "数学", 98.0],
        [4, "student1", "王小明", "ENGLISH", "英语", 96.0],
        [5, "student2", "李小华", "CHINESE", "语文", 89.0],
        [5, "student2", "李小华", "MATH", "数学", 92.5],
        [5, "student2", "李小华", "ENGLISH", "英语", 91.0],
        [6, "student3", "赵小敏", "CHINESE", "语文", 95.0],
        [6, "student3", "赵小敏", "MATH", "数学", 96.5],
        [6, "student3", "赵小敏", "ENGLISH", "英语", 93.0]
    ]
    create_simple_xlsx("02_期末文化课成绩导入表_示例.xlsx", "学科成绩导入", headers, rows)
    create_csv("02_期末文化课成绩导入表_示例.csv", headers, rows)

    # 同时输出可直接复制粘贴到系统“成绩导入中心”文本框的 JSON 格式
    json_data = [
        {"studentId": r[0], "username": r[1], "studentName": r[2], "subjectCode": r[3], "subjectName": r[4], "score": r[5]}
        for r in rows
    ]
    json_path = os.path.join(OUTPUT_DIR, "02_期末文化课成绩导入_文本框即用.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"✅ 生成导入 JSON: {json_path}")

def generate_dimension_scores_file():
    headers = ["studentId", "username", "studentName", "dimension", "dimensionName", "score"]
    rows = [
        [4, "student1", "王小明", "D", "德育", 96.0],
        [4, "student1", "王小明", "Z", "智育", 95.0],
        [4, "student1", "王小明", "T", "体育", 88.5],
        [4, "student1", "王小明", "M", "美育", 91.0],
        [4, "student1", "王小明", "L", "劳育", 94.0],
        [4, "student1", "王小明", "G", "生活故事", 92.0],
        [5, "student2", "李小华", "D", "德育", 90.0],
        [5, "student2", "李小华", "Z", "智育", 92.0],
        [5, "student2", "李小华", "T", "体育", 89.0],
        [5, "student2", "李小华", "M", "美育", 90.5],
        [5, "student2", "李小华", "L", "劳育", 88.0],
        [5, "student2", "李小华", "G", "生活故事", 87.5],
        [6, "student3", "赵小敏", "D", "德育", 95.5],
        [6, "student3", "赵小敏", "Z", "智育", 94.0],
        [6, "student3", "赵小敏", "T", "体育", 93.0],
        [6, "student3", "赵小敏", "M", "美育", 95.0],
        [6, "student3", "赵小敏", "L", "劳育", 96.0],
        [6, "student3", "赵小敏", "G", "生活故事", 93.5]
    ]
    create_simple_xlsx("03_六育主观维度终测评分导入表_示例.xlsx", "六育终测导入", headers, rows)
    create_csv("03_六育主观维度终测评分导入表_示例.csv", headers, rows)

    json_data = [
        {"studentId": r[0], "username": r[1], "studentName": r[2], "dimension": r[3], "dimensionName": r[4], "score": r[5]}
        for r in rows
    ]
    json_path = os.path.join(OUTPUT_DIR, "03_六育主观维度终测评分_文本框即用.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"✅ 生成导入 JSON: {json_path}")

def generate_printable_cards_html():
    """
    生成高度还原 A4 纸打印效果的高清防伪实体激励卡排版 HTML。
    可在浏览器中直接 Ctrl+P / Command+P 另存为 PDF 或直接彩色打印，
    卡面包含防伪编号、防伪条码/二维码视觉、六育徽标、指标类别说明及核销刮涂区说明。
    """
    cards_data = [
        {"sn": "CARD-202610-D0101-00101", "dim": "D", "dimName": "德育·明德卡", "color": "#16a34a", "bg": "#f0fdf4", "border": "#86efac", "cat": "主动礼貌问候", "pts": "+1", "teacher": "张老师", "desc": "见师长主动行礼，与同学文明问好，举止彬彬有礼。"},
        {"sn": "CARD-202610-Z0101-00102", "dim": "Z", "dimName": "智育·博学卡", "color": "#2563eb", "bg": "#eff6ff", "border": "#93c5fd", "cat": "认真完成课堂任务", "pts": "+1", "teacher": "张老师", "desc": "课堂专注听讲，主动参与问题研讨，作业书写工整无误。"},
        {"sn": "CARD-202610-T0101-00103", "dim": "T", "dimName": "体育·强健卡", "color": "#ea580c", "bg": "#fff7ed", "border": "#fdba74", "cat": "大课间操动作标准", "pts": "+1", "teacher": "张老师", "desc": "阳光大课间动作标准有力，队列整齐，展现蓬勃朝气。"},
        {"sn": "CARD-202610-M0101-00104", "dim": "M", "dimName": "美育·尚美卡", "color": "#9333ea", "bg": "#faf5ff", "border": "#d8b4fe", "cat": "班级板报创作优秀", "pts": "+1", "teacher": "张老师", "desc": "用画笔装点班级文化，色彩搭配谐调，富有独特创意。"},
        {"sn": "CARD-202610-L0101-00105", "dim": "L", "dimName": "劳育·笃行卡", "color": "#0d9488", "bg": "#f0fdfa", "border": "#5eead4", "cat": "班级卫生值日负责", "pts": "+1", "teacher": "张老师", "desc": "扫除彻底不留死角，桌椅摆放整齐，热爱劳动乐于奉献。"},
        {"sn": "CARD-202610-G0101-00106", "dim": "G", "dimName": "生活·励行卡", "color": "#c2410c", "bg": "#fffbeb", "border": "#fde68a", "cat": "热心协助集体活动", "pts": "+1", "teacher": "张老师", "desc": "记录生活小确幸，主动关爱伙伴，热心协助集体活动开展。"}
    ]

    html_content = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>六育学生成长评价系统 · 实体防伪激励卡 A4 演示打印样张</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 12mm 10mm;
    }}
    * {{
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      margin: 0;
      padding: 20px;
      background: #f1f5f9;
      color: #0f172a;
    }}
    .print-bar {{
      max-width: 900px;
      margin: 0 auto 20px;
      background: #ffffff;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .print-btn {{
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      border: none;
      padding: 10px 22px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(37,99,235,0.25);
    }}
    .a4-sheet {{
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 14mm 10mm;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      border-radius: 6px;
    }}
    .sheet-header {{
      text-align: center;
      border-bottom: 2px dashed #cbd5e1;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }}
    .sheet-title {{
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #1e293b;
      margin: 0 0 6px;
    }}
    .sheet-subtitle {{
      font-size: 12px;
      color: #64748b;
    }}
    .cards-grid {{
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }}
    .card-item {{
      border-radius: 12px;
      padding: 14px 16px;
      position: relative;
      border: 1.5px solid #e2e8f0;
      background: #fafafa;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-inside: avoid;
    }}
    .card-top {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }}
    .card-badge {{
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }}
    .card-pts {{
      font-size: 18px;
      font-weight: 800;
    }}
    .card-cat {{
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin: 4px 0 6px;
    }}
    .card-desc {{
      font-size: 11px;
      color: #475569;
      line-height: 1.5;
      min-height: 33px;
    }}
    .card-footer {{
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }}
    .card-qr-box {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .mock-qr {{
      width: 44px;
      height: 44px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      font-size: 9px;
      color: #334155;
      font-weight: 700;
      text-align: center;
      line-height: 1.1;
      padding: 2px;
    }}
    .sn-label {{
      font-family: monospace;
      font-size: 10px;
      color: #334155;
      font-weight: 600;
    }}
    .teacher-badge {{
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }}
    .cut-line-tip {{
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px dashed #cbd5e1;
    }}
    @media print {{
      body {{
        background: transparent;
        padding: 0;
      }}
      .print-bar {{
        display: none !important;
      }}
      .a4-sheet {{
        box-shadow: none;
        padding: 0;
        margin: 0;
        width: 100%;
      }}
    }}
  </style>
</head>
<body>

  <div class="print-bar">
    <div>
      <strong style="font-size: 16px;">六育防伪实体激励卡 · 演示样张 (A4 标准打印排版)</strong>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">用于客户现场演示：卡面清晰标明防伪序号、赋分指标与学生申领指引，打印后可裁剪供现场扫码体验。</div>
    </div>
    <button class="print-btn" onclick="window.print()">🖨️ 立即打印样张 (或导出 PDF)</button>
  </div>

  <div class="a4-sheet">
    <div class="sheet-header">
      <div class="sheet-title">🏫 实验小学 · 六育全面发展激励实体评价卡样张</div>
      <div class="sheet-subtitle">2026—2027 学年度第一学期 · 过程性评价防伪凭据 · 扫描或输入序列号即时申领入账</div>
    </div>

    <div class="cards-grid">
'''

    for c in cards_data:
        html_content += f'''
      <div class="card-item" style="background: {c['bg']}; border-color: {c['border']};">
        <div>
          <div class="card-top">
            <span class="card-badge" style="background: #ffffff; color: {c['color']}; border: 1px solid {c['border']};">{c['dimName']}</span>
            <span class="card-pts" style="color: {c['color']};">{c['pts']} 分</span>
          </div>
          <div class="card-cat">{c['cat']}</div>
          <div class="card-desc">{c['desc']}</div>
        </div>
        <div class="card-footer">
          <div class="card-qr-box">
            <div class="mock-qr">
              <span style="font-size: 14px;">📱</span>
              <span>扫码</span>
            </div>
            <div>
              <div class="sn-label">{c['sn']}</div>
              <div class="teacher-badge">发卡教师：{c['teacher']} · 2026年10月期</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 10px; color: {c['color']}; font-weight: 700;">
            防伪凭据
          </div>
        </div>
      </div>
'''

    html_content += '''
    </div>

    <div class="cut-line-tip">
      ✂️ 虚线裁剪说明：沿卡片外沿边缘裁剪后即可分发给学生；学生登录系统在【扫码领取评价卡】输入卡号或扫码即可进入审核队列。
    </div>
  </div>

</body>
</html>
'''

    filepath = os.path.join(OUTPUT_DIR, "04_六育防伪实体激励卡_A4打印样张.html")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"✅ 生成 A4 打印样张: {filepath}")

def generate_sample_honor_certificate_png():
    """
    使用 Python 标准库生成一张符合荣誉证书规范的标准 PNG 图片，
    免依赖第三方图像库，供学生端申报荣誉时上传演示。
    """
    width, height = 800, 560
    # 生成一张米黄色底色的奖状图，四周带有红色边框
    # PNG raw buffer: height rows, each row has 1 filter byte (0) + width * 3 bytes (RGB)
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            # 判断是否在金红色外边框内
            if x < 16 or x >= width - 16 or y < 16 or y >= height - 16:
                # 鲜红外边框
                r, g, b = 185, 28, 28
            elif (x >= 24 and x <= 28) or (x >= width - 29 and x <= width - 25) or (y >= 24 and y <= 28) or (y >= height - 29 and y <= height - 25):
                # 金黄色内细线
                r, g, b = 217, 119, 6
            elif y > 70 and y < 110 and x > 250 and x < 550:
                # 顶部大红飘带区域
                r, g, b = 220, 38, 38
            elif y > 380 and y < 480 and x > 560 and x < 660:
                # 右下角圆形公章模拟（红色）
                dx = x - 610
                dy = y - 430
                if dx*dx + dy*dy <= 45*45:
                    r, g, b = 220, 38, 38
                else:
                    r, g, b = 254, 252, 232  # 米黄色证书底
            else:
                # 证书米黄色底色
                r, g, b = 254, 252, 232
            raw_data.extend([r, g, b])

    compressed = zlib.compress(bytes(raw_data), 9)

    def png_chunk(chunk_type, data):
        length = len(data)
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return struct.pack(">I", length) + chunk_type + data + struct.pack(">I", crc)

    png_bytes = bytearray(b"\x89PNG\r\n\x1a\n")
    # IHDR
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png_bytes.extend(png_chunk(b"IHDR", ihdr_data))
    # IDAT
    png_bytes.extend(png_chunk(b"IDAT", compressed))
    # IEND
    png_bytes.extend(png_chunk(b"IEND", b""))

    filepath = os.path.join(OUTPUT_DIR, "05_学生荣誉奖项证明材料_示例.png")
    with open(filepath, "wb") as f:
        f.write(png_bytes)
    print(f"✅ 生成荣誉证书图片素材: {filepath}")

def main():
    print("🚀 开始生成演示所需全套物料...")
    generate_accounts_file()
    generate_subject_scores_file()
    generate_dimension_scores_file()
    generate_printable_cards_html()
    generate_sample_honor_certificate_png()
    print("🎉 全套演示物料生成完毕！")

if __name__ == "__main__":
    main()
