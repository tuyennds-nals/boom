# Phân tích và giải pháp: Tại sao bot không đặt bom liên tục để phá brick

## Vấn đề chính:

### 1. **Priority 3 (Collect Item) được ưu tiên trước Priority 4 (Destroy Brick)**
- Bot sẽ đi nhặt item thay vì đặt bom phá brick để tạo item mới
- **Giải pháp**: Điều chỉnh logic để ưu tiên đặt bom khi có brick trong phạm vi bom

### 2. **Chỉ đặt bom khi có brick ADJACENT (kề bên)**
- Bot chỉ check 4 ô kề cạnh, không check các brick xa hơn trong phạm vi bom
- **Giải pháp**: Mở rộng logic để đặt bom khi có brick trong phạm vi `bombPower`

### 3. **`_isSafeInRadius(6)` quá chặt chẽ**
- Yêu cầu không có danger nào trong radius 6, kể cả danger nhỏ
- **Giải pháp**: Giảm radius hoặc cho phép danger thấp

### 4. **Nhiều điều kiện safety check quá strict**
- `_hasEscapeRoute`: Có thể quá nghiêm ngặt
- `_blastContainsDangerousBrick`: Ngăn đặt bom khi có brick trong vùng nguy hiểm
- **Giải pháp**: Nới lỏng các điều kiện khi có thể

### 5. **Không check `_canPlaceBomb()`**
- Dòng 913 bị comment: `// if (!this._canPlaceBomb()) return null;`
- **Giải pháp**: Bật lại check này để tránh đặt bom khi đã hết slot

## Giải pháp đề xuất:

### Giải pháp 1: Điều chỉnh priority và logic đặt bom
1. Thêm logic đặt bom ngay khi có brick trong phạm vi bom (không chỉ adjacent)
2. Đặt bom liên tục đến hết `bombLimit` nếu:
   - Có brick trong phạm vi bom
   - Có đường thoát (nhưng không quá strict)
   - Không phá item
   - An toàn tương đối (có thể chấp nhận danger thấp)

### Giải pháp 2: Nới lỏng điều kiện safety
1. Giảm `_isSafeInRadius` từ 6 xuống 3-4
2. Cho phép đặt bom khi có danger thấp (danger < 50)
3. Cho phép đặt bom khi có brick trong vùng nguy hiểm nếu danger không quá cao

### Giải pháp 3: Thêm logic đặt bom strategic
1. Tìm tất cả brick trong phạm vi bom
2. Đánh giá vị trí tốt nhất để đặt bom (phá nhiều brick nhất)
3. Đặt bom liên tục khi có nhiều brick xung quanh

## Code changes cần thiết:

1. **Sửa `_tryDestroyBrick`**: 
   - Mở rộng phạm vi tìm brick (không chỉ adjacent)
   - Giảm `_isSafeInRadius` từ 6 xuống 3-4
   - Cho phép đặt bom khi có danger thấp

2. **Điều chỉnh priority**:
   - Nếu có nhiều brick và chưa đạt `bombLimit`, ưu tiên đặt bom
   - Chỉ nhặt item khi không có brick cần phá

3. **Bật lại check `_canPlaceBomb()`**:
   - Uncomment dòng 913 để kiểm soát số lượng bom

