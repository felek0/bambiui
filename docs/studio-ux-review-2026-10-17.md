# bambiui · Studio UX değerlendirmesi ve uygulanan kararlar

Tarih: 2026-10-17. Kapsam: System-first Studio yerleşimi ve etkileşim hiyerarşisi. Bu belge statik arayüz incelemesi, kaynak analizi, Chromium kontrolleri ve ekran görüntüsü incelemesini kaydeder; gerçek kullanıcı araştırması veya erişilebilirlik sertifikasyonu değildir. Aktif ürün sırası `roadmap.md`, veri/yazma kapsamı `system-first-sf0-contract.md` ile yönetilir.

## Teşhis

| Önceki sorun | Kullanıcıya etkisi | Uygulanan karar |
| --- | --- | --- |
| Library + matrix + Playground + inspector aynı anda dört kolon | 1440px ekranda bile boyut karşılaştırmaları dar bir listeye dönüşüyor; iki farklı iş aynı anda dikkat istiyor | Üç bölge: Library, tam genişlikte çalışma alanı, bağlamsal sağ panel |
| Inspector'da uzun kapsam metinleri ve açık Layers listesi alanlardan önce | Basit bir font-size değişikliği için bile açıklamalar arasından geçmek gerekiyor | Kısa seçim/kapsam başlığı, Layer seçicisi, Frame/Text düğmeleri; hemen altında gerçek stil alanları |
| Playground'da metadata sırasıyla tek büyük prop listesi | İçerik, geometri, davranış ve HTML seçenekleri aynı önemde görünüyor | Appearance, Content, State & behavior, More options grupları; seyrek HTML seçenekleri kapalı |
| Tema ve history farklı görünümlerde farklı yerde; header'da üç panel düğmesi ve import | Kontrol bulmak için ekranı yeniden öğrenme ve gereksiz header yoğunluğu | Ortak çalışma araç çubuğu; header'da sistem kimliği, Design/Develop, kayıt durumu ve export |
| Matrix filtreleri düzenlenen sistemin düşük kontrastlı renklerini miras alıyor | Tasarımın hatası, onu düzeltmek için gereken kontrolleri de kullanılamaz yapabiliyor | Kontroller nötr Studio renkleri; gerçek örnek yüzeyleri System tokenları |
| Develop komutunun ihtiyaç duyduğu JSON başka yerde | Kullanıcı CLI akışından koparak export dialog'una geri dönüyor | CLI komutlarının yanında Download System JSON ve üç adımlı kurulum açıklaması |

## Yeni bilgi mimarisi

### Header: hangi sistemdeyim, nasıl teslim ederim?

- Sistem adı ve seçicisi; System yönetimi ve iki ayrı import eylemi burada.
- Import as new system orijinali korur; Replace from JSON mevcut onay/validasyon davranışıyla değiştirir.
- Design/Develop navigasyonu ve Export tokens korunur. Kayıt hataları menüye saklanmaz.
- Mobilde sistem adı tamamen gizlenmez; uzun adlar kısaltılır, erişilebilir isim tam kalır.

### Sol: Library

- Masaüstü başlangıç genişliği 200px; Foundations ve düz yedi komponent listesi.
- Actions/Forms/Content alt başlıkları kaldırılır. Arama, seçili komponent, override ve contrast uyarıları korunur.
- Library düğmesi çalışma başlığındadır; mobilde panel, bu düğmeyi örtmeden araç çubuğunun altında açılır.

### Orta: tek bir işe odaklanan workbench

- **Variants** varsayılandır: bütün canonical kombinasyonlar, gerçek boyutlarıyla doğal kaydırılır. Yeterli genişlikte Small/Medium/Large yan yana, dar alanda alt alta.
- **Playground** bağımsız canlı örneği aynı geniş alanda gösterir. `Preview only · not exported` denemenin sistem düzenlemesi olmadığını açıklar.
- Modlar native düğmelerle seçilir; aktif durum `aria-pressed`, içerik ilişkisi `aria-controls` ile verilir. Gizli alanlar tab/AX sırasına girmez.
- İki alan mount edilmiş kalır: mod geçişi matrix seçimini/filtrelerini, Playground args/action state'ini veya saved System'i değiştirmez. Komponent değişimi Variants'a döner ve önceki geçici örneği taşımaz.
- History yalnız stil düzenleme bağlamında görünür. Tema aynı araç çubuğunda Design ve Develop boyunca yerini korur.
- Matrix örneğini seçmek Styles panelini açar; contrast bağlantıları ilgili Variants/stil hedefini gösterir. Görünmeyen recipe'ye sessiz yazma yoktur.

### Sağ: aktif işe uygun bağlamsal panel

**Variants / Styles**
- Komponent ve kombinasyon; seçili katman/hedef; kısa reset eylemi.
- Görünür iki kapsam satırı: renk dışı alanlar aynı boyut grubuna ve iki temaya; renkler seçili kombinasyon ve temaya. Text tipografik variant'ını korur.
- Layer seçicisi ve yalnız desteklenen Frame/Text hedefleri. Tam klavye katman listesi isteğe bağlı kapalı Layers bölümünde korunur.
- Stil grupları gerçek kontrolleri önce gösterir. Gruba ait kapsam görünür; karma gruplarda color/non-color ayrımı açık kalır. Alan bazlı kesin kapsam `aria-describedby` ile erişilebilir kalır.
- Scope & value sources alanlardan sonra, Shared defaults ve Base & variant tokens kapalı ikincil bölümlerdir. Hiçbir tüketilen token kontrolü çıkarılmaz.

**Playground / Props**
- Kontroller sağdaki aynı panelde portal ile gösterilir; ikinci bir Styles inspector'ı yanında açık kalmaz.
- Appearance / Content / State & behavior açık; More options kapalı. Tüm desteklenen alanlar ve seçenekler erişilebilir kalır.
- Uzun açıklama, hata ve slot içerikleri multiline kontrol kullanır; boolean seçenekleri yataydır.
- Tek Reset playground eylemi güncel saved defaults'u geri getirir; action/native form state'ini temizler. Stil reset'i değildir.
- Mobil Escape, portalled prop kontrollerinden de paneli kapatır ve Props düğmesine focus döndürür. Yerel bir kontrol Escape'i işlediyse bu eylem panel kapatmaya dönüşmez.

## Bilinçli trade-off ve korunan alanlar

Kalıcı yan yana matrix/Playground karşılaştırması kaldırıldı. Karşılığında her ana iş merkez alanın tamamını kazanır ve yanlış bağlama yazma beklentisi azalır. Modlar arası bir tıklama maliyeti vardır; selection ve geçici state korunarak bu maliyet azaltılır. Varsayılan olarak ikinci bir split-view tercihi eklenmez.

Foundations Colors/Shape & spacing kamera ve token akışları korunur; yalnız ortak araç çubuğuna uyumlandırılır. Bu değişiklik yeni Typography route'u, token modeli, public prop veya schema migration eklemez. Foundations'ta semantic renkler ile skalaların ayrımının ve shared typography keşfedilebilirliğinin insan oturumunda ayrıca değerlendirilmesi gerekir; bu belge onları çözülmüş saymaz.

Project authoring askıda kalır. Recovery, System silme korumaları, localStorage sınırları, fraction/sparse override davranışı, size-based edit/reset kapsamı ve bir hareket/Undo grubu değişmez. CLI/source/registry içeriği bu yerleşim değişikliğinden etkilenmez. Ek API, ağ servisi veya bağımlılık eklenmez.

## Doğrulama ve açık kapılar

- 659 app unit/SSR/source testi: geçti.
- 100 Studio browser kontrolü: geçti.
- 22 Playground browser kontrolü: geçti; mod/klavye/draft discard, gizli alanların AX/focus dışı kalması, props portalı, nötr chrome, 320/390/700px mobil erişim ve bağımsız kaydırma dahil.
- 17 System-only browser kontrolü: geçti; legacy byte koruması, recovery ve System silme dahil.
- 8 source/CLI/JSON browser grubu: geçti; gerçek ZIP/JSON indirmeleri aynı saved snapshot'ı taşır, geçici Playground props'u dışarı sızmaz.
- 26 CLI testi ve source catalog freshness kontrolü: geçti.
- Lint, TypeScript ve production build: geçti. Registry release kimliği öncekiyle aynıdır.

Gerçek kullanıcı görevleri, VoiceOver/Safari/Chrome, gerçek native %200 zoom ve gerçek mobil dokunma/scroll kabulü **açık** kalır. Otomatik test sayısı bu kapıları kapatmaz. Çıktı yerel uygulamadır; commit, publish veya deployment yapılmış sayılmaz.
