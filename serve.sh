#!/bin/bash
# Serve CatCam over HTTPS on your LAN (Web Bluetooth + camera need a secure context).
cd "$(dirname "$0")"
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
mkdir -p .cert
if [ ! -f .cert/c.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout .cert/k.pem -out .cert/c.pem -days 365 \
    -subj "/CN=$IP" -addext "subjectAltName=IP:$IP,DNS:localhost" 2>/dev/null
fi
echo "Open https://$IP:8767/  on the phone (accept the certificate warning once)"
python3 - <<'PY'
import http.server, ssl
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store, max-age=0'); super().end_headers()
h=http.server.ThreadingHTTPServer(('0.0.0.0',8767),H)
c=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); c.load_cert_chain('.cert/c.pem','.cert/k.pem')
h.socket=c.wrap_socket(h.socket,server_side=True); h.serve_forever()
PY
