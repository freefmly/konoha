# 촬영 모드가 보내는 그림을 받아 파일로 적는다: python film_recv.py <저장 폴더> [포트]
# POST /f/00012 → <폴더>/00012.jpg, POST /done → <폴더>/done.txt(보낸 장 수). 앱(다른 포트)에서 보내므로 교차 출처를 허용한다.
import http.server
import os
import sys

OUT = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8820
os.makedirs(OUT, exist_ok=True)


class Recv(http.server.BaseHTTPRequestHandler):
    def _ok(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_OPTIONS(self):
        self._ok()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        name = 'done.txt' if self.path == '/done' else os.path.basename(self.path) + '.jpg'
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(body)
        self._ok()

    def log_message(self, format, *args):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Recv).serve_forever()
