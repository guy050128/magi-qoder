#!/usr/bin/env python3
"""
Subset TsukuhouShogoMin font for MAGI System.
Covers: ASCII + Hiragana + Katakana + CJK Unified Ideographs + common punctuation.
"""
import sys, os
sys.argv = [
    "pyftsubset",
    os.path.join(os.path.dirname(__file__), "../font/TsukuhouShogoMin-OFL.ttf"),
    # Unicode ranges:
    # U+0020-007E  ASCII printable
    # U+00A0-00FF  Latin-1 Supplement
    # U+2010-205F  General Punctuation (em dash, ellipsis…)
    # U+3000-303F  CJK Symbols and Punctuation (。、「」…)
    # U+3041-3096  Hiragana
    # U+309B-309F  Hiragana combining marks
    # U+30A0-30FF  Katakana
    # U+4E00-9FFF  CJK Unified Ideographs (covers Joyo kanji + more)
    # U+F900-FAFF  CJK Compatibility Ideographs
    # U+FF00-FFEF  Halfwidth and Fullwidth Forms
    "--unicodes=U+0020-007E,U+00A0-00FF,U+2010-205F,U+3000-303F,"
    "U+3041-3096,U+309B-309F,U+30A0-30FF,"
    "U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF",
    "--flavor=woff2",
    "--layout-features=*",
    "--output-file=" + os.path.join(os.path.dirname(__file__), "../public/fonts/TsukuhouShogoMin.woff2"),
]

os.makedirs(os.path.join(os.path.dirname(__file__), "../public/fonts"), exist_ok=True)

from fontTools.subset import main
main()

INPUT  = os.path.join(os.path.dirname(__file__), "../font/TsukuhouShogoMin-OFL.ttf")
OUTPUT = os.path.join(os.path.dirname(__file__), "../public/fonts/TsukuhouShogoMin.woff2")
input_size  = os.path.getsize(INPUT)  / 1024 / 1024
output_size = os.path.getsize(OUTPUT) / 1024 / 1024
print(f"\nInput:  {input_size:.1f} MB")
print(f"Output: {output_size:.1f} MB ({output_size/input_size*100:.1f}%)")
