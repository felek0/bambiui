# bambiui Studio UI/UX incelemesi ve iyileştirme planı

Bu belge mevcut Studio'nun **tarihsel** UX denetimi ve doğrulama kayıtlarıdır. Güncel öncelikler [roadmap.md](roadmap.md), sayfa oluşturucunun teknik kapsamı [interface composer planında](interface-composer-plan.md) izlenir. Buradaki Faz 1–4 eski UX çalışmasının fazlarıdır; composer fazlarıyla aynı değildir. Eski bulgular açık görev veya teslim edilmiş yeni ürün özelliği olarak okunmamalıdır. Backend'in paralel uygulanması onaylanmış karar değildir.

## Güncel düzeltme notu · 2026-10-02

Aşağıdaki tarihsel kayıtların üzerine gelen değişiklikler: sistem adı artık sidebar'da değil **header sistem seçicisinde** düzenlenir; çoklu yerel sistem vardır. Global alan sayısı radiusSm/radiusLg eklemeleriyle 32'dir; ortak sm/md/lg radius, komponent variant/state renkleri ve uygun border/shadow kontrolleri uygulanmıştır. Spacing presetlerini Card.Content yanında yeni layout prototipi de tüketir. Overview kaldırılmıştır. Kontrast raporu inspector başlığındaki düğmeyle modal olarak açılır; eski akordiyon önerileri geçerli değildir. Güncel kapsam `docs/component-api.md` ve README ile izlenir.

2026-10-02 uygulama turunda 129 test, build/TypeScript ve hedefli ESLint geçti; yeni sayfa prototipine browser smoke veya görsel/manuel erişilebilirlik kabulü uygulanmadı. Aşağıdaki 106/114 test ve smoke sonuçları kendi tarihlerine aittir, bugünün test sonucu değildir.

Tarih: 2026-09-26

## Uygulama durumu · 2026-09-27

Bu belge özgün incelemenin bulgularını ve o tarihteki doğrulama sonucunu korur; aşağıdaki durum daha sonraki uygulamayı özetler.

- **Faz 1 — uygulandı:** Text snippet ve semantik kontrast denetimi düzeltildi; Badge türetilmiş border ve Text'in tükettiği alias'lar doğru anlatılıyor. Yedi kopyalanabilir örnek `snippets.test.mjs` ile gerçek API'ye karşı derleniyor. Checkbox'ın doğrudan Server Component kullanımı `scripts/check-checkbox-server.mjs` içinde ayrı bir statik Next build'iyle sınanıyor; gerçek tarayıcı hydration'ı bu fixture'da çalıştırılmıyor.
- **Faz 2 — uygulandı:** Oturumluk Undo/Redo, tema kapsamı etiketleri, ilgili input'a odak taşıyan canvas bağlantıları, override variant/state açıklamaları ve preview renklerinden bağımsız canvas araçları eklendi. Studio editörünün vurguları ve yüzeyleri nötr griye çekildi; logo marka renginde kaldı. Proje adı sidebar'a, Design/Develop logo yanına, Undo/Redo canvas sol üstüne ve ikonlu tema anahtarı canvas sağ üstüne taşındı (Develop'ta header'da erişilebilir). Kullanıcı preview paleti ve export değişmedi.
- **Faz 3 — otomatik kapsam kısmen uygulandı:** Readonly, required, error, loading ve controlled form/FormData fixture'ları Chromium smoke ile doğrulandı. Gerçek VoiceOver, browser-native %200 zoom, forced-colors ve dar/geniş tüketici container'larında manuel kabul hâlâ açık.
- **Faz 4 — kısmi genişleme:** Sabit komponent tipografisi `systemConstants` altında merkezileştirildi; ortak `fontFamily` (`system`/`sans`/`humanist`/`serif`/`editorial`/`mono`/`typewriter`) ve `spacingSm`/`spacingMd`/`spacingLg` (4/8/16px) presetleri eklendi; mevcut yedi yerel font seçeneğinin yanına küratörlü Google Fonts presetleri de tanımlandı. Google seçimi isteğe bağlıdır: tarayıcı `fonts.googleapis.com` adresinden stil dosyası, `fonts.gstatic.com` adresinden font dosyası ister ve IP adresi gibi istek verileri Google ile paylaşılır. Yerel seçenekler bu istekleri yapmaz; erişim yoksa yerel fallback kullanılır. Card.Content içindeki öğeler sm/md/lg boyutuna karşılık gelen preset aralığını kullanıyor; eski `paddingX`, `paddingY`, `gap` alias'ları bağımsız kaldı. Elevation/motion ve skala bağımlılık modelinin değişmesi ayrı ürün kararlarıdır.

2026-09-27 doğrulama kaydı: 114 unit/snippet testi, lint, TypeScript, production build ve Chromium smoke başarılı. İzole Checkbox Server Component build'i önceki fazda geçti; bu değişiklikte yeniden çalıştırılmadı. Bu sonuçlar manuel erişilebilirlik kabulü veya hydration tarayıcı testi yerine geçmez.

## Güncel görünüm kararı · kullanıcı geri bildirimi sonrası

Son onaylanan karar: Studio sabit nötr yüzeyler kullanır. Header, sidebar, inspector ve canvas dış zemini Light'ta `#FAFAFA`, Dark'ta `#202020` olur; canvas araçları, Develop ve export penceresi aynı yüzey ailesini izler. Kullanıcının background veya primary renginden editör rengi türetilmez. Alanlar ince çizgiler, boşluk ve seçili durumlarla ayrılır. Önizleme kendi paletini, logo marka rengini, durum göstergeleri semantik renklerini korur. Kullanıcının tokenları/export çıktısı değiştirilmez. Önceki renk türetme denemeleri bu kararın yerini tutmaz.

Header/sidebar/inspector, dark export portalı ve tema geçişi Chromium smoke ile doğrulandı; son lint ve production build/TypeScript başarılı. Desktop Light/Dark ve mobil Dark görüntüleri incelendi. Önceki bölümlerdeki tek açık editör önerileri tarihsel değerlendirmedir; bu karar onların yerini alır. Manuel erişilebilirlik kabulü hâlâ açıktır.

## Özgün denetim · 2026-09-26 — kapsam ve yöntem

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

## Tarihsel token değerlendirmesi (güncel kapsam için üstteki düzeltme notu)

- Özgün incelemede 27 global alan vardı; üç ortak spacing presetiyle 30 oldu. Eski alanları kaldırmak için kanıt yok.
- Asıl gereksiz/yanıltıcı yüzey Text'in tüketmediği ortak komponent tokenları.
- Renk skalası override'ları export ve referansı değiştiriyor; komponent semantik renklerini doğrudan değiştirmiyor. Mevcut yön semantik rol → skala ve durum türevleri. Bunu UI'da açıklamak kısa vadeli çözüm.
- Primitive skala → semantik rol → komponent zincirine geçmek ayrı mimari karardır; otomatik olarak bu incelemenin düzeltmesi sayılmamalı. Seçilirse migration ve açık mapping gerekir.
- Global `margin` kullanılıyor ama uzun vadede dış yerleşimin container sorumluluğunda olması değerlendirilmeli. Mevcut tüketiciyi bozmadan, kullanım senaryosu üzerinden karar verilmeli.
- Kontrol font weight/line-height, Card title ve helper tipografisi kısmen sabit. Önce mevcut değerleri merkezi sabitlerde birleştir; yalnız gerçek ihtiyaç olanları düzenlenebilir token yap.
- Sonraki uygulamada yalnız font family presetleri ve üçlü spacing ölçeği eklendi; radius ölçeği, elevation ve motion için genişleme kararı verilmedi. Presetler Light/Dark arasında ortak; Card.Content öğe aralığı ölçeğin doğrudan tüketicisidir; CSS export `--ds-font-family` ve `--ds-spacing-sm/md/lg` üretir. Google preseti seçildiğinde CSS export, her iki tema seçicisinden önce dosyanın başına `@import` koyar ve `--ds-font-family` içine yerel fallback'li çözülmüş font yığınını yazar; CSS tüketicisi de uzaktan istek yapabilir. Yerel presetlerde import yoktur. JSON, font dosyası veya URL yerine iki tema kaydında aynı preset kimliğini saklar; Google kimlikleri schema v3 ile uyumludur, sürüm artışı gerekmez. Eski v3 kayıtları `system` varsayılanıyla tamamlanır, eski padding/gap değerleri ve override'ları dönüştürülmez.
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

Tipografi sabitlerinin merkezileştirilmesi ve font family/spacing presetleri uygulandı; renk skalası bağımlılık modeli hakkında ürün kararı açık. Gerekirse yeni komponentler ancak bundan sonra.

Kabul: Eklenen her tokenın tanımlı tüketicisi, birimi, varsayılanı, tema kapsamı, reset/import/export ve test karşılığı var. Mevcut JSON uyumluluğu korunur veya açıkça migrate edilir.

## Özgün doğrulama sonucu · 2026-09-26

- Unit testleri: 106 geçti.
- ESLint: geçti.
- TypeScript `--noEmit --incremental false`: geçti.
- Yedi snippet'in ayrı bellek içi TSX kontrolü: Text için TS2322 bulundu; normal proje tip kontrolü string snippet'lerini derlemediği için bunu kaçırıyor.
- `npm run build`: geçti.
- `node scripts/studio-smoke.mjs --screenshots`: başarısız; `scripts/studio-smoke.mjs:576` canvas içinden spacing bağlantısı sonrası `/spacing` beklerken zaman aşımı. Diğer raporlanan kontroller geçti. Test zamanlaması/görünür hedef mi, gerçek navigasyon sorunu mu henüz ayrıştırılmadı.
- Screenshot dizini boş kaldı; ekran görüntüsü incelemesi tamamlanmış sayılmadı.
- Manuel VoiceOver, browser-native zoom ve kullanıcı görev testi yapılmadı.

Smoke başarısızlığı için ilk adım: Kamera hareketi sonrası hedefin viewport içinde ve doğru hit target olduğunu doğrulamak, sonra aynı etkileşimi görünür hedef üzerinden tekrar üretmek. Kanıt olmadan yalnız timeout artırmak veya uygulama navigasyonunu değiştirmek çözüm sayılmaz.

## Tarihsel görsel yön denemesi: Studio ile Design önizlemesinin sınırı

Bu bölümdeki açık görünüm/karar bekleme ifadeleri o denemenin tarihsel durumudur. Üstteki “Güncel görünüm kararı” bunların yerini alır; yeniden uygulama talimatı değildir.

Durum (2026-09-27): **Orta-koyu matte prototipi kullanıcı geri bildirimiyle geri alındı.** Uygulanacak görsel yön henüz kararlaştırılmadı; önceki açık Studio görünümü ve marka renkli logo korundu. İnceleme görsellerinde açık önizleme beyaz sidebar/inspector ile birleşiyor; koyu önizleme ise açık editörün yanında geniş, siyah bir blok gibi duruyor. Bu, öncelikle **örneğin sınırı ve çalışma alanının kime ait olduğunun anlaşılması** sorunu. Ekran görüntüleri kullanıcı tercihini veya erişilebilirlik kabulünü tek başına kanıtlamaz.

### Seçenekler ve tercih

| Seçenek | Avantaj | Risk / karar |
| --- | --- | --- |
| Editör kromunu kullanıcının `primary` rengine uydurmak | Marka hissi verebilir | Düzenleme sırasında kontrollerin rengi ve kontrastı oynar; Studio ile tasarlanan sistemi karıştırır. **Reddedildi.** Logo küçük marka vurgusu olarak renkli kalabilir. |
| Tüm Studio'yu sabit koyu yapmak | Açık örneği belirginleştirir | Koyu örnek yine editöre karışabilir; uzun inspector/code okumasını ve tüm kontrol yüzeylerini yeniden tasarlamayı gerektirir. Mevcut tek açık editör kararını değiştirir. **Şimdilik seçilmedi.** |
| Açık nötr editörü koruyup Design alanında sabit orta-koyu nötr bir çalışma zemini (matte) ve sınırlı, gerçek renkli örnek kullanmak | Açık/koyu örneğe ayrı bir sahne ve tutarlı editör kimliği verir; Develop ve token editörü değişmez | Alan kaybı ve siyaha/matte rengine yakın örnekte sınır kaybı riski. **Prototiplendi ve görsel olarak reddedildi; yeniden uygulanmamalı.** |

**İlke:** Studio araçları Studio renkleriyle, örnek yalnız kullanıcı `--ds-*` renkleriyle çizilir. Zemini orta-koyu seçmek önizlemeyi karartmak, üzerine opak katman koymak veya kullanıcı tokenını değiştirmek anlamına gelmez. Matte tek başına her renkte ayırt edicilik garantisi vermez; görünür bir çerçeve/keyline gerekir. Editör için yeni kullanıcı tarafından düzenlenebilir token, kalıcı görünüm ayarı veya kullanıcı `primary` renginden türetilen kontrol rengi eklenmez. İleride ayrı bir Studio koyu modu ancak bağımsız tercih ve görev testiyle değerlendirilebilir; Light/Dark önizleme anahtarı Studio görünüm anahtarı değildir.

### Reddedilen prototipin uygulama taslağı (yeniden uygulama talimatı değildir)

1. **Sınırı ayır ve prototiple:** `app/globals.css` içindeki `.workspace-content[data-design] .preview-canvas` ve `.preview-frame` üzerinde kullanıcı `--preview-background` / `--preview-foreground` boyamasını kaldırıp sabit Studio matte ve Studio metin rengi kullan. `app/studio/studio.tsx` içindeki `previewColors` aktarımını yalnız gerçekten gerekli tüketicilere indir; `app/studio/preview.tsx` içindeki `ThemePane` / `app/studio/preview.module.css` içindeki `.viewport` kullanıcı `--ds-background` ve diğer renklerle **gerçek önizleme** olarak kalsın. Develop, inspector, kaydedilen tema ve CSS/JSON export bu değişimden etkilenmesin.
2. **Sahneyi sınırla:** Desktop'ta üstteki Undo/Redo ve Light/Dark kontrollerinin üst şeridini matte üzerinde bırak; önizleme viewport'una ölçülü kenar boşluğu ve belirgin, temadan bağımsız çerçeve ver. `width: 100%` ve `height: 100%` zincirini göz önünde bulundurarak kullanılabilir pan/zoom alanını veya Fit hesaplarını kazara küçültme; görünür alan değişirse Fit geometrisini uyumlu kıl. Çok açık, çok koyu ve matte ile aynı renkte arka planlarda çerçeveyi doğrula; gerekirse sabit çift katmanlı açık/koyu keyline veya yalnız sınırın yerel aydınlığına göre çizilen çizgi kullan, kontrol paletini `primary`'ye bağlama. Focus çizgisi ve forced-colors sınırı kaybolmamalı.
3. **Dar ekrana ayrı davran:** 375px ve 200% native zoom/reflow'da gutter'ı küçült, örneği ekrana sığdır; `@media (max-width: 760px)` içindeki doğal akış ve `@media (max-width: 640px)` içindeki sayfa kaydırmasını koru. Yeni yatay taşma, zorunlu iç içe scroll veya üst kontrollerle içerik çakışması yaratma.
4. **Doğrula, sonra karar ver:** Desktop ve 375px ekran görüntülerini Light/Dark ile karşılaştır; beyaz, siyah, matte ile eşleşen, doygun ve düşük kontrastlı özel arka planlarla sınırı test et. Pan/zoom/Fit, örneğe tıklama, tokena gitme, tema değiştirme, klavye odağı ve görünür kontrol isimleri için smoke/regresyon kontrolü yap. VoiceOver, forced-colors ve native %200 zoom'u manuel kabul et; bunlar yapılmadan erişilebilirlik tamamlandı deme. Kısa görev denemesinde kullanıcının 'Studio aracı mı, tasarlanan sistem mi?' ayrımını ve Light/Dark geçişinin neyi değiştirdiğini doğru okuyup okumadığını gözle; sonuçlara göre matte tonunu veya çerçeveyi ayarla, otomatik olarak bütün editörü koyulaştırma.

**O prototip için teknik kabul taslağı (görsel kabul sağlanmadı):** Her iki tema ve uç renklerde örnek sınırı görünür; Studio araçlarının metni/ikonları ve focus durumu kullanıcının renklerinden bağımsız, okunur kalır (normal metin için en az 4.5:1, anlam taşıyan sınır/ikonlar için en az 3:1 hedefle ve test et). Önizlemenin piksel renkleri, export, tema kayıtları ve Develop çıktısı değişmez. Desktop pan/zoom/Fit ile mobil doğal kaydırma çalışır; 375px ve native %200'de içerik/kontrol çakışmaz. Önceki prototip otomatik testleri geçse de görsel geri bildirim olumsuzdu; otomatik test görsel kabul değildir. Manuel VoiceOver/forced-colors/%200 zoom ve kullanıcı görev testi hâlâ açık.

**Geri bildirim sonrası ikinci deneme:** Sorun yalnız canvas çevresindeki koyu çerçevenin açık nötr Studio ile uyumsuzluğu olarak netleşti. Koyu matte/çift katmanlı çerçeve yerine mevcut Studio canvas yüzeyi (`--studio-color-canvas`) kontrollerin arkasında sürdürülür; tema rengi yalnız önizlemede kalır, sınır tek ince nötr çizgidir ve desktop gutter 8px'tir. Mobil doğal akış korunur. Bu uygulama da görsel olarak kullanıcı tarafından henüz onaylanmadı.

### Bütünsel renk ve yerleşim iyileştirmesi · 2026-09-27

Kaynak CSS, desktop Light/Dark, mobil canvas ve inspector görüntüleri değerlendirildi. Açık nötr Studio korunuyor; marka logosu ve anlam taşıyan başarı/uyarı renkleri nötrleştirilmiyor. Kullanıcı paleti, tipografisi ve komponent ölçüleri değiştirilmiyor.

| Bulgu | Uygulanan iyileştirme |
| --- | --- |
| Menü seçimi ve hover aynı derecede silik | Seçime daha belirgin nötr yüzey, kalın metin ve ince sol işaret; hover daha hafif kaldı. |
| Inspector kapsam/override metinleri 8–9px, font alanları ikinci kez içeri girintili | Kritik yardımcı metinler 10–11px'e çıkarıldı; foundation alanları diğer tokenlarla hizalandı. |
| Panellerin aralıkları ve kontrollerin yükseklikleri tutarsız | Sidebar/inspector genişlikleri dengelendi; header kompaktlaştırıldı, inspector başlığı canvas kontrol şeridiyle hizalandı; ortak kontrol yüksekliği 36px oldu. İki sütunlu sayısal alanların etiket/override satırlarına aynı yükseklik ayrıldı. |
| Color builder ve kontrast özetinde gereksiz boşluk | Bölüm ve içerik aralıkları sıkılaştırıldı; açılan kontrast listesi 240px ile sınırlandı. Uyarı renkleri ve presetlerin 36px hedefi korundu. |
| Mobil header rastgele satır kırıyor | Marka ve Design/Develop ilk satır, token bağlantısı ve dosya işlemleri ikinci satır; mevcut DOM/klavye sırası korundu. |
| Canvas araçları örneğin fontunu miras alıyor | Araçlar açıkça Studio fontunu kullanıyor; viewport focus göstergesi de kullanıcı foreground'undan bağımsızlaştırıldı. |
| Dar desktop'ta yardım ve zoom aynı alanı kaplıyor | Dar canvas container'ında yardım üst sıraya taşındı; 820/980/1100px genişliklerinde çakışmazlık testi eklendi. |
| Studio 640px, örnek 760px'te doğal akışa geçiyor | Eşikler 760px'te eşitlendi; 700px'te inspector'ın örneği takip ettiği ve sayfanın taşmadığı sınandı. |

Doğrulama: 114 unit/snippet testi, lint, production build/TypeScript ve Chromium smoke geçti. Görsel kontrol otomatik erişilebilirlik kabulünün yerine geçmez; VoiceOver, native %200 zoom ve forced-colors manuel kabulü açık. Yeni görsel yönün kullanıcı onayı da ayrıca gerekli.
