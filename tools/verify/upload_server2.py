#!/usr/bin/env python3
"""upload_server2.py — 本地接收器：POST /upload?name=xxx.wav（或 .json）→ ab-demo/engine_out/xxx。仅监听 127.0.0.1。"""
import http.server, os, re, socketserver, urllib.parse

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine_out")
os.makedirs(OUT, exist_ok=True)


class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        name = urllib.parse.parse_qs(u.query).get("name", [""])[0]
        if u.path != "/upload" or not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}\.(wav|json)", name):
            self.send_response(400); self._cors(); self.end_headers(); return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        open(OUT + name, "wb").write(body)
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(b"OK %d" % len(body))
        print("saved", name, len(body), flush=True)

    def log_message(self, *a):
        pass


class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with S(("127.0.0.1", 8787), H) as s:
        print("receiver on 127.0.0.1:8787", flush=True)
        s.serve_forever()
