# Hướng dẫn gán nhãn NER caption — FoodTrip

Nhãn theo BIO trên từng token: `B-BUSINESS`, `I-BUSINESS`, `B-LOC`, `I-LOC`, `O`.
Một cụm = một token `B-` và các token `I-` liền sau cùng loại.

## BUSINESS — tên riêng của một cơ sở có địa điểm

Gán khi caption gọi tên **một nơi cụ thể** khách có thể đến: quán ăn, nhà hàng,
quán cafe, tiệm bánh, quầy hàng có tên, khách sạn, homestay, resort, cửa hàng.

- Lấy **trọn tên như người ta gọi**, kể cả từ chỉ loại hình nếu nó là một phần
  tên: *Quán Ốc Oanh*, *Nhà hàng Cơm Niêu Nghệ*, *Tiệm bánh Givral*,
  *Bánh Xèo 7 Tới*, *Phở Thìn Bờ Hồ* (cả cụm, không tách *Bờ Hồ* ra LOC).
- **Từ chỉ loại hình đứng ngay trước tên luôn lấy vào cụm**, kể cả khi kèm loại
  món: *Quán cà phê Bình Minh Ơi*, *nhà hàng hải sản Ra Khơi*, *quán cơm Nam Đô*,
  *Tiệm Cà Phê Túi Mơ To*. Quy tắc máy móc này giúp các người duyệt gán giống nhau.
- **Tên món là một phần tên quán** thì lấy cả: *Lẩu vịt nấu chao Thành Giao*,
  *Cơm niêu Chạn*, *Bánh mì Phượng*. Món đứng tách xa tên thì chỉ lấy tên
  (*Bánh xèo củ hủ dừa* … *chú 7 Tới* → *chú 7 Tới*).
- Phần mô tả tiếng Anh dính liền tên: lấy cả (*Chuồn Chuồn Bistro & Bar*,
  *Xin Chào Seafood Restaurant*, *43 Factory Coffee Roaster*).
- Tên trong ngoặc kép: chỉ lấy phần trong ngoặc.
- Mô tả đứng **sau** tên không lấy (*Faifo* | *Quán Cà Phê Sân Thượng* → chỉ *Faifo*).
- Chuỗi / thương hiệu có cửa hàng: *Highlands Coffee*, *Phúc Long*, *Pizza 4P's*.
- Tên không viết hoa vẫn gán: *bún chả hương liên*.
- Có số nhà/chi nhánh đi kèm: chỉ lấy tên, không lấy địa chỉ
  (*Phở Thìn* | *13 Lò Đúc* → `Lò Đúc` là LOC, `13` là O).

**Không** gán BUSINESS:
- Tên món chung chung: *bánh xèo*, *cơm tấm*, *cà phê muối*.
- Tên kênh, KOL, người (*Obama*, *Ninh Tito*), tên chương trình, hashtag.
- Cụm mô tả không phải tên: *quán ăn ngon*, *một tiệm nhỏ ven đường*.
- Sản phẩm, hãng không phải nơi đến (*iPhone*, *Grab*).

## LOC — địa danh

- Quốc gia, tỉnh/thành, quận/huyện, phường/xã, đường phố, khu phố, chợ,
  hồ, núi, biển, địa danh du lịch: *Việt Nam*, *Cần Thơ*, *Cái Răng*,
  *Hồ Gươm*, *Chợ Bến Thành*, *Lê Văn Hưu*, *phố cổ Hội An* → chỉ *Hội An*.
- Viết tắt và tiếng Anh vẫn gán: *HCM*, *Sài Gòn*, *Saigon*, *Da Nang*.
- Tiền tố hành chính *TP* / *thành phố* / *phường* / *thị trấn* **không** lấy
  (*TP Cần Thơ* → *Cần Thơ*). Ngoại lệ: tên viết tắt dính liền (*TPHCM*,
  *TP . HCM*, *TP.HCM*) và quận số (*Quận 1*, *Q1*, *Quận Gò Vấp*).
- Khu du lịch, khu vui chơi, trung tâm thương mại, dự án là **LOC**:
  *Vinpearl*, *VinWonders*, *Grand World*, *Lotte Westlake*, *Novaworld*.
- Viết sai chính tả vẫn gán như viết đúng (*Nah Trang*, *Ocean Cofee*).
- Địa danh nằm **bên trong tên quán** thuộc BUSINESS (xem *Phở Thìn Bờ Hồ*).

## Trường hợp khác

- Hashtag (`#hanoi`, `#phothin`): gán `O` hết.
- Emoji, dấu câu, số nhà, giá tiền, giờ: `O`.
- Caption tiếng Anh: áp dụng y hệt.
- Caption **không liên quan ẩm thực / du lịch** (quảng cáo điện thoại, tin
  tức…): đánh dấu *loại bỏ*, không đưa vào dữ liệu.
- Caption liên quan nhưng **không nhắc tên quán nào**: giữ lại, là caption âm
  (toàn `O` cho BUSINESS, vẫn gán LOC nếu có).
- Không chắc: đánh dấu *cần xem lại* kèm ghi chú, không đoán.

## Quy trình duyệt

1. Mỗi caption có nhãn **gợi ý** (từ máy hoặc AI hỗ trợ). Gợi ý chưa phải
   nhãn chuẩn.
2. Người duyệt đọc cả caption, sửa nhãn trong công cụ `ml/review/review.html`,
   chọn *Đã duyệt*, *Loại bỏ* hoặc *Cần xem lại*.
3. Chỉ caption *Đã duyệt* mới vào validation/test gold.
4. Ghi tên người duyệt và ngày; công cụ tự lưu vào file xuất.
