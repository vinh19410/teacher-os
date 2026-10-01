# Research: Grok bot treo khi mở HTTPS (TLS 1.3) tới app.teacheros.io.vn (#290)

Thời điểm: 2026-10-01 09:12 ICT. Phạm vi: lỗi trên đường mạng đi ra của máy agent, không phải lỗi sản phẩm.

## Kết luận

Nhiều khả năng nhất: gói ClientHello của TLS 1.3 quá lớn so với tunnel WARP nên bị rớt. Các client đời mới (OpenSSL 3.5+, Chrome, BoringSSL) mặc định gửi key share post-quantum `X25519MLKEM768`, làm ClientHello phình từ khoảng 300 byte lên khoảng 1.300–1.500 byte. Gói lớn như vậy bị tách thành 2 TCP segment hoặc vượt MTU của tunnel WARP (1.280–1.361 byte). Khi một middlebox hoặc tunnel làm rớt hay ghép sai segment, server không bao giờ gửi ServerHello về và client đứng chờ đến timeout. ClientHello của TLS 1.2 không có key share PQ, đủ nhỏ để lọt qua, nên đúng với triệu chứng "TLS 1.2 vào được, TLS 1.3 treo".

Mức tự tin: trung bình đến cao. Bằng chứng ủng hộ:
- TLS 1.3 tới chính `cloudflare.com` cũng treo, nên không phải do zone `teacheros.io.vn`.
- Trang trace báo `warp=on` và `gateway=on`, tức máy agent đi qua tunnel WARP.
- Người dùng ở Việt Nam đăng nhập bình thường qua TLS 1.3.

Chưa làm phép thử phân biệt ở mục bên dưới. Khả năng thứ hai: edge IAD ghép sai ClientHello bị tách thành nhiều segment. Từng có tiền lệ ở edge MAD, và cách khắc phục ở phía client vẫn giống hệt.

Không nên sửa gì ở dashboard Cloudflare của Teacher OS. Zone không có cấu hình nào gây ra lỗi này, và hạ TLS cho toàn zone thì ảnh hưởng người dùng thật.

## Phép thử phân biệt (chạy trên máy agent)

```bash
# 1. TLS 1.3 nhưng chỉ dùng key share cổ điển. Nếu lệnh này OK mà mặc định treo => xác nhận ClientHello PQ quá lớn
curl -4 --tlsv1.3 --curves X25519 -I --connect-timeout 10 https://app.teacheros.io.vn/login

# 2. TLS 1.3 mặc định (có PQ) => kỳ vọng treo
curl -4 --tlsv1.3 -I --connect-timeout 10 https://app.teacheros.io.vn/login

# 3. Đo path MTU (Linux): giảm dần -s cho tới khi ping qua được
ping -M do -s 1400 -c 2 104.21.73.21
ping -M do -s 1252 -c 2 104.21.73.21

# 4. Trạng thái WARP
warp-cli status
warp-cli settings | grep -iE 'pmtu|protocol|mode'
```

## Cách khắc phục (ưu tiên từ trên xuống, đều làm ở phía máy agent)

1. **Tách teacheros.io.vn ra khỏi tunnel WARP.** Ở Split Tunnels chọn chế độ Exclude, rồi thêm domain `teacheros.io.vn` (kèm các subdomain). Nếu là WARP do tổ chức quản lý (`gateway=on`) thì cần admin Zero Trust cấu hình. Nếu máy không cần WARP thì tắt hẳn (`warp-cli disconnect`). Đây là cách sạch nhất và thoả tiêu chí nghiệm thu của #290 (HTTPS mặc định trả về 200).
2. **Sửa MTU của WARP.** Chuyển tunnel sang MASQUE và bật PMTUD (mặc định bật từ client 2026.6.822.0). Hoặc kẹp MSS (MSS clamping) trên host hay container của agent, ví dụ:
   `iptables -t mangle -A OUTPUT -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`.
3. **Tắt key share PQ ở client** (giải pháp tạm):
   - curl: thêm `--curves X25519:P-256`.
   - OpenSSL/Python: đặt `Groups = X25519:P-256` trong `openssl.cnf`.
   - Chrome/Chromium: policy `PostQuantumKeyAgreementEnabled=false`. Policy này đã deprecated và bị gỡ sau Chrome 145/146, nên không chắc còn tác dụng trên bản hiện tại. Edge không cho tắt.
   - Firefox: policy `PostQuantumKeyAgreementEnabled=false` vẫn còn hiệu lực.
4. **Tạm thời ngay hôm nay:** bot đã tự xác nhận vào được khi ép TLS 1.2 hoặc đi qua proxy local. Hãy cho phép bot chạy roleplay qua proxy đó thay vì đứng chờ #290. Đây không phải cách nghiệm thu, nhưng gỡ chặn được việc kiểm chứng v0.0.10.

## Cập nhật: đối chiếu tài liệu "Configure TLS-inspecting proxies" của Grok Bot

Tài liệu này nói về chiều từ máy thành viên tới Cursor (`*.cursor.sh`, `*.*.cursorvm.com`), không nói về chiều từ hosted computer ra Internet. Lỗi #290 thuộc chiều thứ hai, nên allowlist và miễn kiểm tra TLS trong tài liệu không sửa được lỗi này. Tài liệu chỉ ra ba điểm liên quan:

- Theo mặc định, traffic của hosted computer đi ra qua các static egress IP dùng chung của Cursor và không đi qua gateway trên máy thành viên. Điều này khớp với bằng chứng AWS Ashburn kèm `warp=on`/`gateway=on`. Suy luận: đường ra của Cursor đi qua Cloudflare WARP/Gateway, nên chỗ sửa nằm phía Cursor.
- Có tuỳ chọn "Route egress through this desktop" để đưa traffic của hosted computer đi qua mạng của máy thành viên. Máy ở Việt Nam đang chạy TLS 1.3 bình thường, nên đây là cách gỡ chặn nằm hoàn toàn trong tay mình.
- Network policy (chỉ có ở gói Enterprise) chỉ giới hạn đích đến. TLS 1.2 vào được nên policy không chặn teacheros.io.vn.

Đường ra không bị kiểm tra TLS: qua TLS 1.2 vẫn thấy chứng chỉ gốc của Google Trust Services WE1, không phải CA của gateway. Vì vậy lỗi không phải do bị re-sign, mà khớp với giả thuyết ClientHello lớn bị rớt.

## Câu hỏi còn mở

- Grok bot chạy trên hạ tầng nào? WARP do ai quản lý (xAI, nhà cung cấp sandbox hay chính mình)? Nếu mình không có quyền cấu hình thì chỉ dùng được cách 3 và 4.
- Browser của bot là Chromium bản nào? Từ đó mới biết policy PQ còn dùng được không.
- Chưa có kết quả phép thử 1 và 3.

## Nguồn

- Cloudflare docs, PQC to origin (cảnh báo ClientHello bị tách thành nhiều segment): https://developers.cloudflare.com/ssl/post-quantum-cryptography/pqc-to-origin/
- WARP client hỗ trợ PQC: https://blog.cloudflare.com/post-quantum-warp/
- WARP PMTUD và MTU tunnel: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/mdm-deployment/path-mtu-discovery/
- WARP Split Tunnels: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/warp/configure-warp/route-traffic/split-tunnels/
- WSL2 + WARP timeout do lệch MTU 1500/1280: https://hackmd.io/@trungnhan/wsl2-warp-timeout
- Lỗi ghép TCP ở edge MAD khi ClientHello lớn hơn một segment: https://community.cloudflare.com/t/tcp-reassembly-issue-at-cloudflare-mad-edge-node-tls-client-hello-split-across-se/911621
- Go #80573, ClientHello ML-KEM làm middlebox đứng: https://github.com/golang/go/issues/80573
- OpenSSL 3.5 PQ handshake EOF: https://apiyillc.mintlify.app/en/faq/openssl-pq-handshake-eof
- Chrome PostQuantumKeyAgreementEnabled: https://instinctive.app/chromesettings/postquantumkeyagreementenabled
- Firefox PostQuantumKeyAgreementEnabled: https://firefox-admin-docs.mozilla.org/reference/policies/postquantumkeyagreementenabled/
- Edge (không tắt được): http://www.learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/postquantumkeyagreementenabled
