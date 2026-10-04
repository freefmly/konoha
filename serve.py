# 나뭇잎 마을 — 로컬 정적 서버 (PM2가 pythonw로 띄움, 포트 8819)
# python -m http.server와 같지만 모든 파일에 "Cache-Control: no-cache"를 붙인다.
# 화면 코드가 ES 모듈(js/*.js) 여러 개라, 캐시 설정이 없으면 브라우저가 옛 파일과 새 파일을 섞어 불러올 수 있다.
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8819
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, format, *args):  # pythonw라 콘솔이 없다 — 접속 기록은 남기지 않음
        pass


http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()
