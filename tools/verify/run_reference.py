#!/usr/bin/env python3
"""
run_reference.py — Run the C++6 finalized reference (6-minute seed 64) through the same set of phone-speaker gates as verify_engine; one command produces the same loudness report on any machine.

Usage: python3 run_reference.py
Dependencies: python3 (numpy, scipy), ffmpeg.
Output: gate-by-gate PASS/FAIL + reference_report.json (written to the current directory).
"""
import json, os, sys
import verify_engine as ve

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "ZenScape_R8_Cpp6_s64.mp3")
EV = json.load(open(os.path.join(HERE, "reference_s64_events.json")))

m = ve.metrics(REF, EV)
for k in ["LUFS", "peak_dBFS", "bell_over", "qin_over", "quiet_s", "deep_s", "floor_vs_full",
          "wall_pct", "pass_spread", "max_rise_2s", "max_jump_05s", "deep_stretches",
          "qin_DR", "bell_DR", "jitter_pct", "tail_last1s", "clicks", "dur"]:
    print(f"{k:16s} {m[k]}")
print()
ok = True
for k, f, label in ve.GATES:
    p = f(m[k]); ok &= p
    print(("PASS " if p else "FAIL ") + label, "→", m[k])
print("ALL PASS" if ok else "SOME FAIL")
json.dump(m, open("reference_report.json", "w"), ensure_ascii=False, indent=1, default=float)
