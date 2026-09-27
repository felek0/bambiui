# bambiui Studio UI/UX incelemesi ve iyileştirme planı

Tarih: 2026-09-26

## Uygulama durumu · 2026-09-27

Bu belge özgün incelemenin bulgularını ve o tarihteki doğrulama sonucunu korur; aşağıdaki durum daha sonraki uygulamayı özetler.

- **Faz 1 — uygulandı:** Text snippet ve semantik kontrast denetimi düzeltildi; Badge türetilmiş border ve Text'in tükettiği alias'lar doğru anlatılıyor. Yedi kopyalanabilir örnek `snippets.test.mjs` ile gerçek API'ye karşı derleniyor. Checkbox'ın doğrudan Server Component kullanımı `scripts/check-checkbox-server.mjs` içinde ayrı bir statik Next build'iyle sınanıyor; gerçek tarayıcı hydration'ı bu fixture'da çalıştırılmıyor.
- **Faz 2 — uygulandı:** Oturumluk Undo/Redo, tema kapsamı etiketleri, ilgili input'a odak taşıyan canvas bağlantıları, override variant/state açıklamaları ve preview renklerinden bağımsız canvas araçları eklendi.
- **Faz 3 — otomatik kapsam kısmen uygulandı:** Readonly, required, error, loading ve controlled form/FormData fixture'ları Chromium smoke ile doğrulandı. Gerçek VoiceOver, browser-native %200 zoom, forced-colors ve dar/geniş tüketici container'larında manuel kabul hâlâ açık.
- **Faz 4 — kontrollü başlangıç:** Sabit komponent tipografisi `systemConstants` altında merkezileştirildi; yeni düzenlenebilir global token veya yeni komponent eklenmedi. Font family, spacing ölçeği, elevation/motion ve skala bağımlılık modelinin değişmesi gerçek kullanım gereksinimine bağlı ayrı ürün kararlarıdır.

Güncel doğrulama: 109 unit/snippet testi, lint, TypeScript, production build, Chromium smoke ve izole Checkbox Server Component build'i başarılı. Bu sonuçlar manuel erişilebilirlik kabulü veya hydration tarayıcı testi yerine geçmez.

## Kapsam ve yöntem

Hedef: local-first tasarım sistemi playground'unda foundation düzenleme → komponent üzerinde doğrulama → geliştirici referansı → CSS/JSON aktarımı akışının güvenilirliği.

Kaynak kod, komponent sözleşmesi, token modeli, mevcut testler ve production build incelendi. Bu rapor kullanıcı araştırması, ekran okuyucu kabulü veya ekran görüntüsü üzerinden tamamlanmış görsel tasarım denetimi değildir. Uygulama kodu değiştirilmedi.

## Genel karar

Mevcut yedi komponent için foundation temeli yeterli; baştan yazım veya kontrolsüz token/komponent artışı gerekmiyor. Öncelik, gösterilen değer/kaynak ile gerçek render davranışını eşleştirmek ve denemeleri geri alınabilir kılmak.

Korunacak kararlar:

- Editör görünümü ile tasarlanan sistemin görünümünün ayrılması.
- Light/Dark arasında yalnız renklerin farklılaşması; geometri ve tipografinin ortak olması.
- Local-first kayıt, açık CSS/JSON export sınırları ve import validasyonu.
- Base UI semantiği, ortak komponent API'si ve merkezi renk türetimi.
- Design ve Develop ayrımı; mobilde doğal sayfa kaydırması.

## Doğrulanmış tutarsızlıklar

| Öncelik | Bulgu | Kanıt | Düzeltme |
| --- | --- | --- | --- |
| P1 | Text snippet'i desteklenmeyen `tone="secondary"` kullanıyor; kopyalanan TSX derlenmiyor. | `app/studio/snippets.ts:189`, `developer.tsx:115`, `components/types.ts:5` | Mevcut Tone sözleşmesine uygun örnek ve props tablosu; bütün snippet'leri derleyen test. |
| P1 araştırma | Checkbox kendi client sınırını tanımlamadan Base UI Indicator'a render fonksiyonu geçiriyor. Studio client ağacında çalışması doğrudan Server Component kullanımını doğrulamıyor. | `app/studio/components/checkbox.tsx:1–51` | Önce Server Component tüketim fixture'ıyla doğrula; sınırı gerekiyorsa yalnız Checkbox üzerinde kur. Çalışma zamanı yeniden üretimi henüz yapılmadı. |
| P2 | Text kontrast raporu yalnız nötr foreground'u kapsıyor; semantik tonlarda gerçek CSS rengi farklı. | `app/studio/color-audit.ts:115–116`, `components/components.module.css:474–478` | Her desteklenen tonun gerçek on-subtle rengini denetle. Bellek testinde success Text 1.64:1 iken nötr Text 4.67:1 geçebiliyor. |
| P2 | Badge outline rengi türetilmiş olmasına rağmen inspector global border değerini kaynak olarak gösteriyor. | `app/studio/tokens.ts:347–366,430–441`, `components/components.module.css:482–512` | Global / Derived / Override kaynaklarını ve etkili değerleri ayır. Erişilebilir türetimi sırf tabloya uydurmak için kaldırma. |
| P2 | Text için export/Develop içinde görünümü beslemeyen ortak komponent alias'ları sunuluyor. | `app/studio/tokens.ts:405–412`, `developer.tsx:298–318,407–415`, `components/components.module.css:389–401` | Komponent bazlı tüketilen token metadata'sı; eski alias'lar gerekiyorsa uyumluluk alanı olarak ayrılmalı. |
| P2 | Canvas swatch/sample bağlantıları belirli bir alanı düzenleme vaadi veriyor ama yalnız kategori/rol seçiyor; ilgili input'a odak taşımıyor. | `app/studio/preview.tsx:573–601` | Token anahtarı/stop seçimini inspector'a taşı; alanı görünür kıl ve uygun odak davranışı tanımla. |
| P3 | README/roadmap eski modelin parçalarını anlatıyor: altı komponent, bağımsız sayısal temalar, eski responsive kontrol, ortak inspector ve eski export/audit kapsamı. | `README.md:7–40`, `docs/roadmap.md:5–16`, güncel `studio.tsx:637–640` | Mevcut yedi komponent, ortak non-color değerler, canvas ve yalnız Design inspector akışını belgeye yansıt. |

## Studio UX değerlendirmesi

### Güvenli düzenleme

`studio.tsx:261–269` her geçerli değişikliği anında localStorage'a yazıyor. Reset/import onayı var, fakat geçmiş veya Undo/Redo yok. Renk üretimi iki temayı birden değiştirdiğinden hatalı denemenin maliyeti yüksek.

Öneri: Bir kullanıcı işlemini tek geçmiş adımı sayan Undo/Redo. Slider/color-picker hareketlerini birleştir; palette apply, reset ve import ayrı atomik işlemler olsun. Kaydetme durumuyla geçmiş durumunu birbirine karıştırma. Native input metin geri almasını klavye kısayollarıyla bozma.

### Kapsamın anlaşılması

Inspector başlığı her bölümde Light/Dark gösteriyor; sayısal alanlar ise iki temayı değiştiriyor (`studio.tsx:293–295,646–651`). Typography açıklaması ortaklığı söylüyor ama shape grubu aynı açıklığı taşımıyor.

Öneri:
- Renk alanlarında `Light only` / `Dark only`.
- Geometri ve tipografide `Shared · Light + Dark`.
- Palette apply için `Updates both themes`.
- Override alanında hangi variant/state'in etkilendiği.
- Colors/spacing reset etiketlerinde gerçek kapsam; color-scale override'larının korunup korunmadığı açıkça belirtilmeli.

### Bilgi mimarisi

Text hem foundation typography'sine giriş hem komponent. Typography'nin yalnız Text inspector'ında bulunması keşfedilebilirliği sınırlıyor. İlk aşamada yeni ekranlar üretmeden açık bir Typography yönlendirmesi ve global/komponent ayrımı yeterli. İleride foundation ile Text komponentini ayırmak bir ürün kararıdır; mevcut bug değildir.

Overview inspector'ı global renkler, boyutlar ve skalaları birlikte sunuyor. Başlangıç akışı için kısa yönlendirme, gruplama ve ikincil alanların aşamalı açılması önerilir; bütün tokenları kaldırmak gerekmez.

### Canvas

Pan/zoom, Fit ve klavye pan desteği mevcut. Kullanım açıklaması yalnız ekran okuyucuya açık (`preview.tsx:507`). Görünür kısa yardım veya yardım düğmesi keşfedilebilirliği artırır.

Canvas zoom araçları tasarlanan sistemin background/foreground/border değerlerini tüketiyor (`preview.module.css:29–76`). Kullanıcı kontrastı bozduğunda editör araçları da okunaksızlaşabilir. Editör araçlarını studio tokenlarıyla; specimen'i tasarım sistemi tokenlarıyla beslemek daha güvenlidir.

Bir specimen ile ilk etkileşim aynı anda route seçimi ve kamera merkezlemesini başlatabiliyor (`preview.tsx:293–295,459–496`). Bu kasıtlı davranışın form doldurma sırasında rahatsızlık oluşturup oluşturmadığı gerçek görev denemesiyle değerlendirilmelidir. Sidebar navigasyonu ile doğrudan specimen etkileşimi için farklı kamera politikası düşünülebilir.

Canvas zoom, responsive viewport veya gerçek browser zoom testi değildir. Mevcut kapsamda yeni responsive toolbar zorunlu değil; fakat tüketici komponentlerinin dar/geniş container testi gereklidir.

## Token kararı

- 27 global alanın tamamının mevcut kullanım karşılığı var; hepsini azaltmak için kanıt yok.
- Asıl gereksiz/yanıltıcı yüzey Text'in tüketmediği ortak komponent tokenları.
- Renk skalası override'ları export ve referansı değiştiriyor; komponent semantik renklerini doğrudan değiştirmiyor. Mevcut yön semantik rol → skala ve durum türevleri. Bunu UI'da açıklamak kısa vadeli çözüm.
- Primitive skala → semantik rol → komponent zincirine geçmek ayrı mimari karardır; otomatik olarak bu incelemenin düzeltmesi sayılmamalı. Seçilirse migration ve açık mapping gerekir.
- Global `margin` kullanılıyor ama uzun vadede dış yerleşimin container sorumluluğunda olması değerlendirilmeli. Mevcut tüketiciyi bozmadan, kullanım senaryosu üzerinden karar verilmeli.
- Kontrol font weight/line-height, Card title ve helper tipografisi kısmen sabit. Önce mevcut değerleri merkezi sabitlerde birleştir; yalnız gerçek ihtiyaç olanları düzenlenebilir token yap.
- Font family, spacing/radius ölçeği, elevation ve motion tam kütüphane hedefinde adaydır. Mevcut playground için hepsini inspector'a eklemek gereksiz karmaşıklık olur.
- Shared Light/Dark invariant normal edit/reset/import yollarında korunuyor. Export'un doğrudan normalize edilmemiş nesneyle çağrılması için savunmacı doğrulama ileride eklenebilir.

## Komponent kapsamı

Yeni komponent eklemeden önce mevcut yedinin durum kapsamını tamamla:

- Button: gerçek callback ile loading'e geçiş, tekrar aktivasyon engeli, fullWidth ve kompozisyon.
- Input: required/readonly, controlled değer, name/FormData, endIcon.
- Switch: error, readonly, required, hidden label ve checked+disabled.
- Checkbox: lg, description, readonly, labelPosition=start, hidden label, controlled kullanım.
- Card: lg, Card.Content; variant ve density örneklerini ayır.
- Badge: startIcon; metinsiz kullanım için erişilebilir içerik politikası.
- Text: sm/lg, semantik tonlar ve gerçek heading semantiği için ayrı test.

Her prop kombinasyonunu canvas'a koyma. Tarama için küçük variant/size/state grupları; ayrıntılı davranış için odaklı fixture'lar kullan. Card'ın article/strong semantiğini kullanım bağlamına göre genişletmek olası iyileştirme, her kullanımda hata değil.

Textarea, Select, RadioGroup veya Alert ancak gerçek form/feedback senaryosu gerektirirse sonraki kapsam olmalı. Dialog/Popover/Toast eklemek mevcut güvenilirlik sorunlarını çözmez.

## Uygulama sırası ve kabul kriterleri

### Faz 1 — Referans ve davranış doğruluğu

Text snippet/props, Checkbox sınır araştırması, Text kontrast kapsamı, Badge kaynak gösterimi, tüketilen token metadata'sı ve güncel dokümantasyon.

Kabul: Bütün snippet'ler derlenir; desteklenen örnekler Next.js tüketim sınırlarında çalışır; inspector/Develop gerçek CSS tüketimiyle eşleşir; başarısız Text tonları raporda görünür.

### Faz 2 — Güvenli ve anlaşılır Studio düzenleme

Undo/Redo, theme/shared kapsam etiketleri, tokena doğrudan yönlendirme, reset kapsamı ve override'ın variant/state açıklaması; canvas araçlarını studio görünümünden besleme ve görünür yardım.

Kabul: Palette apply/import/reset tek adımda geri alınır; kullanıcı düzenlemeden önce hangi temaların etkileneceğini görebilir; tıklanan token alanına ulaşır; bozuk preview renkleri editör kontrollerini bozmaz.

### Faz 3 — Komponent ve erişilebilirlik kabulü

Eksik specimen durumları, callback/form fixture'ları, dar/geniş container kontrolleri, klavye ve focus akışı, VoiceOver, native %200 zoom ve forced-colors.

Kabul: Loading sırasında tekrar işlem yok; readonly/disabled/required ve form gönderimi doğrulanmış; odak görünür ve erişilebilir; erişilebilirlik iddiaları test kapsamını aşmıyor.

### Faz 4 — İhtiyaca bağlı foundation genişlemesi

Tipografi sabitlerinin merkezileştirilmesi; font family ve spacing ölçeğinin ihtiyacının değerlendirilmesi; renk skalası bağımlılık modeli hakkında ürün kararı. Gerekirse yeni komponentler ancak bundan sonra.

Kabul: Eklenen her tokenın tanımlı tüketicisi, birimi, varsayılanı, tema kapsamı, reset/import/export ve test karşılığı var. Mevcut JSON uyumluluğu korunur veya açıkça migrate edilir.

## Doğrulama sonucu

- Unit testleri: 106 geçti.
- ESLint: geçti.
- TypeScript `--noEmit --incremental false`: geçti.
- Yedi snippet'in ayrı bellek içi TSX kontrolü: Text için TS2322 bulundu; normal proje tip kontrolü string snippet'lerini derlemediği için bunu kaçırıyor.
- `npm run build`: geçti.
- `node scripts/studio-smoke.mjs --screenshots`: başarısız; `scripts/studio-smoke.mjs:576` canvas içinden spacing bağlantısı sonrası `/spacing` beklerken zaman aşımı. Diğer raporlanan kontroller geçti. Test zamanlaması/görünür hedef mi, gerçek navigasyon sorunu mu henüz ayrıştırılmadı.
- Screenshot dizini boş kaldı; ekran görüntüsü incelemesi tamamlanmış sayılmadı.
- Manuel VoiceOver, browser-native zoom ve kullanıcı görev testi yapılmadı.

Smoke başarısızlığı için ilk adım: Kamera hareketi sonrası hedefin viewport içinde ve doğru hit target olduğunu doğrulamak, sonra aynı etkileşimi görünür hedef üzerinden tekrar üretmek. Kanıt olmadan yalnız timeout artırmak veya uygulama navigasyonunu değiştirmek çözüm sayılmaz.
