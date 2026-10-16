# bambiui · System-first roadmap

Güncelleme: 2026-10-16. **Aktif kapsam ve iş sırasının tek kaynağıdır.** Kullanıcı kararı: Project/sayfa oluşturma şimdilik askıya alınacak ve UI'dan çıkarılacak; mevcut yedi komponentin token düzenleme deneyimi oturtulacak, ardından Figma kit ve yeni komponentler değerlendirilecek.

System-only ilk uygulama dilimi yerelde uygulanıp otomatik testlerle doğrulandı: Project authoring UI askıda, katman inspector'u ve matrix filtreleri aktif; komponent workspace'i matrix + bağımsız Playground olarak ikiye ayrıldı. Commit/deploy ve manuel kullanıcı/erişilebilirlik kabulü yapılmadı; Figma kit henüz teslim edilmedi. Önceki kod/test/yayın kanıtları [tarihsel roadmap'te](roadmap-history-2026-10-16.md) korunur; oradaki Project odaklı sıralama artık aktif değildir. Agent görevleri ve yazma sınırları: [System-first uygulama planı](system-first-execution-plan.md).

**Kullanıcı edit-scope amendment'ı uygulandı:** [SF0 superseding amendment](system-first-sf0-contract.md#superseding-user-amendment--size-based-editor-write-groups) renk dışı edit/reset'leri aynı-size katman grubuna yayar; Text tipografik variant'ını korur, renkler exact/current-theme kalır. Güncel 637 app testi, 99 System ve 17 System-only browser kontrolü geçti; insan kabulü açık. Önceki baseline kayıtları aşağıda ayrı tutulur.

**Yeni kullanıcı isteği — split Playground:** Desktop'ta orta alan 50/50 matrix + Storybook tarzı bağımsız canlı örnek; dar ekranda alt alta. Sağ inspector yalnız stil düzenler. Playground tüm desteklenen public eksenleri, içerik ve state prop'larını sunar; matrix seçimi/örnek içeriği ve token/export/history verisini değiştirmez. Tema, görünüm, matrix seçimi/filtreleri ve stil değişimlerinde args korunur; component/System/import/reload veya açık Reset playground ile sıfırlanır. Yaşam döngüsü [SF0 amendment'ında](system-first-sf0-contract.md#superseding-user-amendment--independent-split-playground). 647 app testi, 99 System, 17 Playground, 17 System-only, 7 source/ZIP browser grubu ve 26 CLI testi geçti; lint/TypeScript/build/catalog kontrolleri temiz, registry hash'i değişmedi. Desktop Card ve mobil split ekran görüntüleri incelendi; insan kabulü hâlâ açık.

## 1. Ürün odağı

> Komponentinin bütün kombinasyonlarını gör, istediğin katmanı düzenle, tutarlı tasarım sistemini tasarımcıya ve geliştiriciye teslim et.

- Tasarımcı, design engineer ve frontend developer aynı component/variant/size/tone/state/part dilini kullanır. Figma'ya tanıdık seçim ve inspector davranışı hedeflenir; Figma klonu yapılmaz.
- Aktif ürün **System + Develop**. Project, page/frame composer, saved-project assets, layout authoring ve frame source teslimatı askıda.
- Önce Button, Input, Card, Badge, Switch, Checkbox ve Text ile deneyim tamamlanır. Başarı komponent sayısıyla değil doğru kapsamda, yardımsız düzenleme ile ölçülür.
- Kod teslimatı CLI + statik registry olarak kalır; npm `bambiui@0.2.1` yayımlanmış baseline'dır. System CSS/JSON ve kapalı manual ZIP fallback korunur.
- Figma kit, uygulama içi sayfa editörünün yerine tasarım kompozisyonu için değerlendirilen teslimattır. Kullanıcının özel tokenlarının kit'e otomatik aktarılması ve çift yönlü senkronizasyon mevcut özellik değildir.

## 2. Bugünkü gerçek durum ve hedef farkı

| Alan | Mevcut | Hedef / açık |
| --- | --- | --- |
| Giriş | `/` System Colors; `/pages[/]` ve page-editor askı ekranı | Deploy ve gerçek kullanıcı kabulü |
| Shell | Normal girişte composer mount yok; read-only legacy reference/recovery adapter var | System storage stale-tab/quota güvenliğini SF5'te ayrıca tamamla |
| Komponentler | Yedi komponent, 294 exact kombinasyon, frame/text katmanları | Aynı kapsama daha okunabilir matrix ve seçime bağlı inspector |
| Değerler | Effective değer, kesirler, reset/no-op/history altyapısı var | Kontrol sayısını azaltmadan doğru katman için doğru kontrolleri sunma |
| Playground | Matrix'ten bağımsız props/içerik/state denemesi; yedi komponentte tam desteklenen eksenler; sağ panel yalnız stil | Gerçek kullanıcı split alan, scope ve lifecycle kabulü |
| Tema | Light/Dark renkleri ayrı, geometri/tipografi ortak | Değişmeyecek; inspector etkisi açık olacak |
| Teslimat | CLI/npm/prod registry, source, clean React/Vite → Next consumer doğrulandı | UX değişiklikleri mevcut source/API sözleşmesini bozmayacak |
| Project verisi | Eski raw bytes korunuyor; askı ekranında allowlist'li raw recovery indirme | Restore/import yok; atomik çok-sekme backup garantisi yok |
| Figma | Eşleme araştırması `figma-kit-contract.md` içinde; kit yok | SF4/SF5 sonrası mapping revalidation, gerçek authoring sahibi/erişimi ve Card pilotu |

## 3. Değişmeyecek sınırlar

1. `AGENTS.md`, `docs/component-api.md`, Base UI değişiyorsa `docs/base-ui.md` okunur. Next kodundan önce kurulu Next rehberi okunur; static export ile uyumlu çözüm gerekir.
2. Schema v3, iki tema, Light'tan normalize edilen ortak non-color veriler, eski kesirli değerler ve sparse overrides korunur. UX işi schema migration gerekçesi değildir.
3. Reset override'ı kaldırır; hesaplanan değeri kaydetmez. Seçim, filtreleme, help, preview ve no-op edit token/history yazmaz.
4. Exact kayıt kimliği ile UI write group ayrıdır: non-color aynı component/size/part/target için tüm desteklenen variant/state/tone kayıtlarına yayılır; Text ayrıca typographic variant'ı korur (`paragraph.sm` altı tone, h1/caption değil). `background`/`color`/`borderColor` yalnız seçili exact recipe/theme'e yazılır. Shared/base ayarlar ayrıdır. Focus outline global erişilebilirlik sınırıdır; dekoratif border/shadow onu kapatmaz.
5. Her editable token'ın typed alanı, gerçek CSS tüketicisi, reset/import/export, ilgili contrast ve testi olmalı. Bu turda yeni token eklemek varsayılan çözüm değildir.
6. Project UI kapatılırken storage key'leri, eski kayıtlar, systemId referansları ve silme korumaları korunur. Bağlı/okunamayan Project kaydı varken sistem silme güvenliği kaldırılmaz. Gizli veriyi temizleyen migration yok. localStorage taraması başka açık sekmenin kaydedilmemiş belleğini/history'sini okuyamaz; böyle bir garanti verilmez. Eski authoring sekmesi açık olabilecek rollout ve kurtarma davranışı SF0'da açıkça kaydedilir.
7. Preview içeriği/durumları geçicidir; eski `componentDefaults` verisi silinmez, yeniden anlamlandırılmaz veya preview state'iyle üstüne yazılmaz. Canonical matrix kayıtlı defaults'u okur; Playground bunlardan bağımsız bir args kopyası başlatır ve matrix'e session override geçmez. Eski per-recipe interaction sandbox'ları ayrı kalır; canonical matrix axes/anatomy gizlenmez. CSS/JSON/ZIP/CLI çıktısı session overrides'tan değil kaydedilmiş System snapshot'ından üretilir. ZIP populated example eski defaults'u kullanmaya devam eder; CLI ise React API defaults'unu yeniden yazmaz. Bu fark UI'da açıklanır.
8. UI İngilizce, ürün adı her yerde `bambiui`. Backend/auth/cloud, yeni runtime bağımlılığı ve otomatik publish/deploy bu planın parçası değil.
9. Project UI ile ortak tüketici altyapısı aynı şey değildir. `page-document`, `component-defaults`, `layout` ve dağıtım allowlist'indeki modüller ZIP/CLI tarafından da kullanılır; UI kapandı diye silinmez. CLI `add layout`, mevcut public props ve immutable registry release'leri korunur.

## 4. Aktif aşamalar

Durum: `[ ]` başlanmadı, `[~]` kısmi, `[x]` kanıtla tamamlandı. Aşağıdakiler yeni iş paketleridir; tarihsel test başarıları bunları kapatmaz.

### SF0 — Sözleşme ve baseline

- [x] **SF0.1 Envanter:** aktif route/UI/metadata/help bağlantılarını, System'in composer bağımlılıklarını ve storage yazılarını listele.
- [x] **SF0.2 UX sözleşmesi:** seçimin `component + recipe + part + frame/text target` yapısını koru; Card pilotunun ekran/inspector taslağını ve keyboard/focus davranışını tanımla.
- [x] **SF0.4 Kullanıcı edit-scope amendment'ı — uygulandı:** UI helper mevcut exact kayıtlara non-color fan-out yapar; field reset aynı kapsamı, mixed target reset her field'ın kapsamını kullanır. Input error yalnız invalid/readonly, choice error yalnız invalid state'ler. Tek `onRecipesChange` tek undo gesture group taşır. Inspector seçili örneği ölçer ve write scope'u etiketler; inspection peer normalize etmez. Eski divergent kayıtlar ilgili edit/reset'e kadar kalır. All combinations bölümü hâlâ all sizes kapsamındadır. Yeni size token/runtime inheritance/schema migration veya CSS/resolver/import/public API değişikliği yok; source catalog/registry kimliği aynı kaldı. Helper/unit testleri, gerçek Button/Text/Card browser regresyonları ve kaynak teslimatı geçti; version/publish yok. İnsan kabulü ayrı kapıdır.
- [x] **SF0.3 Kabul baseline'ı:** D, A'nın sözleşme taslağı üzerinde System-only görevlerini ve route/storage fixture tasarımını hazırlar. Kodu henüz uygulanmamış bir testin geçmesi SF0 şartı değildir; expected failure ayrı kaydedilir.

**Teslimat:** [Dondurulmuş SF0 sözleşmesi](system-first-sf0-contract.md): mevcut prop/type sınırları, route matrisi, storage read/write envanteri, Card inspector taslağı, keyboard/focus, preview/filter yaşam döngüsü ve test eşlemesi. QA incelemesi ve koordinatör onayı tamamlandı. System silme onayı için native confirmation yerine controlled app dialog amendment'ı gerçek ikinci-sekme regresyonuyla doğrulandı. A taslak → D baseline incelemesi → koordinatör sözleşme freeze/onayı sırasıyla ilerler; D'nin katkısı için SF0'ın önce tamamlanması gerekmez.

**Çıkış:** SF1/SF2/SF3 sözleşmesi freeze edilmiş, çakışmasız yazıcılar ve test sahipleri belli; uygulama başlamadan belirsiz edit scope yok. Freeze sonrası interface değişikliği A/B/C/D'ye handoff edilmeden uygulanmaz.

### SF1 — System-only giriş ve Project'i askıya alma

- [x] `/` doğrudan System Design / Colors açar (mevcut route fallback'i). `/colors`, `/spacing`, geçerli komponent route'ları, `/develop` ve `/develop/<component>` korunur. Unsupported route mevcut not-found davranışını korur; root ve `/pages[/]` aynı route sanılmaz. Seçim değiştirmek otomatik token/default yazmaz; boş durumda Project oluşturma CTA'sı yok.
- [x] `/pages` ve `/pages/` eski linkleri statik uyumlu, açık bir askıya-alındı ekranı ve System'e geçiş ile karşılanır; composer mount olmaz. Eski layout her child'ın önünde `<Studio />` render ediyordu; yeni WorkspaceShell sınırı askı route'unda Studio'yu mount etmez. Askı ekranının arkasında/önünde ikinci Studio, history handler veya gizli editör bulunmaz; client redirect flash/loop ya da gizli yeniden açma düğmesi eklenmez.
- [x] Header Project/System switch, project manager, page/frame/asset araçları ve Project'e yönelten aktif yardım/marketing kaldırılır. System selector, Design/Develop, Light/Dark, history ve CSS/JSON erişimi korunur.
- [x] `useComposer` sırf görünmez UI için çalıştırılmaz. Read-only referans adapter'ı kayıtlı Project index/documents'u inceler; loading, erişim hatası, eksik/bozuk kayıt durumunda silme kapalıdır. Referanslar render başına tüm projeyi parse ederek değil kontrollü bir snapshot ile okunur; storage event/yeniden focus ve silme onayı öncesi tekrar kontrol edilir. Index dışında kalmış partial/orphan document davranışı SF0'da belirlenir; index yok diye kayıtlar otomatik sahipsiz kabul edilmez. TOCTOU/çok-sekme atomikliği iddiası yok.
- [x] Public `/examples/page-editor` authoring girişi askıya alınır. Statik account-settings consumer fixture'ı test amaçlı kalabilir, normal navigasyonda Project alternatifi olarak sunulmaz. Composer model/export/unit testleri tutulur.
- [x] Eski Project keys/bytes System açılışı, tema değişimi, reload ve route geçişinde değişmez. Sistem silme engeli anlaşılır mesaj verir; projeye gidip çözme, otomatik rebind veya storage temizleme önermez. Güvenli alternatif System'i duplicate/export edip ayrı kopyada devam etmektir.
- [x] Erişim kapanmadan minimum recovery yolu tanımlanır: askı ekranında yalnız açık kullanıcı eylemiyle eski yerel verileri indirme; authoring yok. SF0 raw key/value kurtarma dosyasının allowlist'ini (Project index/documents, ilgili System/legacy kayıtları), byte limitini ve hata politikasını sabitler. Geçersiz JSON'un orijinal string'i de korunur; başka origin/app localStorage verisi toplanmaz, upload yok. Okunamayan kayıt atlanıp tam backup diye sunulmaz. Bu ham kurtarma çıktısı restore/import desteği olan yeni Project bundle formatı değildir; UI bunu ve unsaved başka-sekme belleğinin dahil olmadığını açıklar. Recovery implementasyonu SF1 kapsamıdır, B01/B02'yi yeniden açmaz.

**Çıkış:** root/System/Develop/direct-link/back-forward testleri geçer; Project erişimi yalnız menüden gizlenmiş değildir. Önceden kayıtlı kullanıcı verisi korunur. Yeni System-only browser kapsamı hazır olmadan eski workspace testini topluca silmek/yoksaymak kabul edilmez.

### SF2 — Card pilotu: sade, katman odaklı inspector

- [x] Üst bağlam component, o komponentte gerçekten var olan variant/size/tone veya state eksenlerini ve katmanı gösterir. Olmayan eksen için dummy kontrol yok. Selection null ise açık seçim çağrısı; görünmeyen Medium/default recipe sessizce edit hedefi olmaz. Seçili örnek ile inspector aynı hedefi anlatır.
- [x] Root/frame: Layout & spacing, Corners, Surface, Border & shadow. Text: Typography, Color ve yalnız o katmanın tükettiği ek alanlar. Bunlar yeni CSS serbestliği veya token vaadi değil, mevcut field allowlist'inin gruplarıdır. Boş/no-op alan sunulmaz; mevcut desteklenen alanlar kaybolmaz. Foundations (Colors/Shape & spacing), font-family, contrast raporu ve rapordan doğru alanı açma/focus etme akışı korunur.
- [x] Padding/margin/corners bağımsız kenarlardır; link durumu açıktır. Kesirli değerler korunur; çok uzun değer/help/hata dar panelde okunabilir kalır.
- [x] Exact ayarlar ana alan, all-combination/shared/base ayarlar ayrı kapalı bölümdür. Kısa etki açıklaması ve görünür reset; ham CSS adı isteğe bağlı teknik detaydır.
- [x] System Parameters insertion-default sekmesi aktif UX'ten çıkarılır. Örnek prop/içerik/state seçenekleri orta alanın bağımsız Playground bölümünde session state olur; inspector'da ikinci Preview sekmesi veya starting-component editörü yok. SF0 system/component/recipe/part/theme/view/filter/close/reset/reload için yaşam döngüsü tablosunu sabitler. System değişimi/reload geçici değerleri sıfırlar; token Undo'ya veya export'a karışmaz. Insertion default'ları doğrudan değiştiren gizli yazım callback'i aktif akışta kalmaz.
- [x] Card.Header/Title/Description/Content/Footer seçiminde nested Text/Button scope'u korunur; standalone komponent recipe'sine yanlış edit gitmez.

**Güncel çıkış (amendment; otomatik kontroller geçti, insan kabulü açık):** kullanıcı `outlined.md / Card.Title` seçerek 19.375px/635 yazar; aynı title/text alanları üç md Card variant'ında değişir. Root sol padding 23.125px/top-left 17.25px aynı size root/frame grubuna yayılır. sm/lg, ilgisiz alan/katmanlar ve standalone Text/Button değişmez. Title color yalnız seçili exact recipe/theme'de değişir. Field/mixed reset, tek gesture Undo/Redo ve Light-Dark/export/import değişmeyen exact kayıt semantiğiyle tutarlıdır.

### SF3 — Matrix ve seçim ergonomisi

- [x] Komponent açılışında tüm kombinasyonlar erişilebilir; varsayılan görünüm bütün matrisi sunar. Variant/state grupları, size/tone etiketleri okunur; starting component paneli yok.
- [x] Kalabalık Text/tone matrisinde opsiyonel filtreleme ve seçime odaklanma; aktif filtre/sayı ve Clear görünür. Filtreleme kombinasyonları/tokenları silmez veya inspector için yeni varsayılan hedef seçmez. Seçim gizlenirse stale hedefte edit durur. SF0 filter/component/system/route/theme değişiminde pending numeric/color draft ve focus politikasını belirler: eski draft yeni hedefe blur ile uygulanmaz, invalid draft engeli sessiz kaybolmaz. Contrast raporu gibi dış seçimler gerekirse filtreyi açıp hedefi görünür kılar.
- [x] Frame/text seçimi, hover/selected sınırları ve klavye ile katman seçimi tutarlı. Mevcut design hit-target örnekleri ile gerçekten interaktif preview ayrı kalır; disabled/loading örneği de layer/frame kontrolünden seçilebilir. Filtrelenmiş/aria-hidden örneklerde focusable descendant kalmaz. Panel açma/kapama, zoom/pan/fit selection'ı bozmadan çalışır.
- [x] Desktop merkez alanı 50/50 matrix canvas + bağımsız Playground doldurur; dar ekranda bu iki alan alt alta, mobil yan paneller overlay kalır. Metinlerin okunması için canvas zoom ile native browser zoom karıştırılmaz.
- [~] 180 Text örneğinde başlangıç/filtreleme/seçim/pan ölçümü. Node SSR warm 5-run medyanı 9.54ms (8.96–12.04ms) alındı; bu browser pan/interaction performans kanıtı değildir. Browser profiling açık; renderer/virtualisation rewrite yapılmadı.

**Çıkış:** 294 kayıt coverage'ı korunur; klavye ile bir exact katmana ulaşılır; filter/no-op storage testi ve 390px reflow geçer. SF2 ile aynı selection sözleşmesini kullanır.

### SF4 — Aynı deneyimi yedi komponente yay

- [x] Button: mevcut exact `root` ve `text` (UI Label) katmanları, loading/disabled ve geçici native interaction state ayrımı. Button için bağımsız editable `icon` recipe katmanı yoktur; ikon preview prop'udur, bu tur yeni token/katman eklemez.
- [x] Input: root/control/label/description/error; invalid/readOnly katmanları. Error konum/ikon/örnek içerik Preview, hata tipografisi exact style; bu preview özellikleri token şemasına taşınmaz.
- [x] Switch/Checkbox: checked/unchecked/invalid kombinasyonları; label/description/error ve focus ayrı.
- [x] Badge/Text: tone/variant/size kapsamı, gerçek tüketilen tipografi ve yüzey renkleri; Text görsel varyantı semantik heading'i zorlamaz.
- [~] Her komponentte alan/katman matrisi, specimen ve Develop referansı kontrol edilir. Yeni public prop/token gerekirse ayrı gerekçeli dilim; tüm schema/API/audit/source testleriyle birlikte.

**Doğrulanmış baseline:** Button 18, Input 9, Switch 12, Checkbox 12, Badge 54, Card 9, Text 180 = 294 recipe. Bu sayı aynı eksenleri koruyan UX revizyonunun regresyonudur; tüm komponentler için tone/state çapraz çarpımı veya disabled/hover recipe eklemek gereği çıkarılmaz. Exact parts `components/recipes.ts` ve shared parts ilgili metadata'dan gelir; kod kimliği yerine UI etiketi uydurulmaz.

**Çıkış:** Card'a özel çalışan tasarım değil, yedi komponentte tutarlı inspector; state preview sıfır token write; CSS/JSON/CLI parity ve contrast kapsamı korunur.

### SF5 — System-only kabul ve veri güvenliği

- [~] Yeni görev oturumu: seçili örnek ile size-based non-color/exact-color write scope ayrımı; Card, Text variant + altı tone, conditional Input/choice error, mixed reset, tek gesture history, Button state, theme, System export/import ve Develop teslimatı. Project oluşturma başarı ölçütü değildir.
- [ ] Keyboard, VoiceOver Safari/Chrome, gerçek %200 zoom, uzun metin ve mobile native scroll/pinch. Not run/assisted/pass ayrımı; major/blocker varken tamamlandı denmez.
- [~] System-only storage hata/retry, bozuk import ve iki sekme davranışı A'nın SF0 envanterinden itibaren izlenir, D tarafından test edilir; bu korumaların zaten tamamlandığı varsayılmaz. Eksikse A `systems.ts`/Studio persistence sınırında ayrı sınırlı düzeltme yapar; kullanıcıya in-memory System'i export etme yolu kalır. Project bundle yapılmaz. SF1'in getirdiği data-loss riski SF5'e ertelenmez; discovery anında rollout'u bloklar.
- [x] CLI `0.2.1` baseline, local source consumer ve clean published consumer korunur. Preview state'i değişince aynı saved System'in CSS/JSON/ZIP semantic içeriği değişmez; captured snapshot pending seçim değişiminden etkilenmez. Dağıtılan kaynak değişirse immutable snapshot/resolver compatibility ayrı release kapısıdır; UI değişti diye CLI version artırılmaz. Pure resolver modüllerini değiştirmek fingerprint/pin uyumluluğunu etkileyebilir; yalnız UI taşımak için ortak dağıtım kodu yeniden yazılmaz.

**Çıkış:** mevcut yedi komponent için yardımsız temel görevler ve ilgili manuel kabul kaydedilmiş, kaynak round-trip ve data-safety testleri geçmiş. Test sayısı tek başına kabul değildir.

### SF6 — Figma kit pilotu ve teslimat

- [~] **SF6.1 Eşleme sözleşmesi:** code component/axes/parts ↔ Figma component properties/layers/variables/text styles; shared geometry vs Light/Dark renk modları; CSS-only ve desteklenmeyen eşlemeler açık. E erken taslak üretebilir; SF4 sonrası code/API, registry source hash ve kullanılan System snapshot kimliğiyle yeniden doğrular. Font metrikleri, CSS rounding ve Figma variable/style sınırlamaları için kabul toleransı ve manuel eşlemeler pilot başlamadan yazılır.
- [ ] **SF6.2 Card pilotu:** kullanıcı gerçek kit sahibi/tasarımcıyı, authoring aracını/erişimini ve inceleyeni atadıktan sonra başlar. Mevcut agent araçlarının Figma dosyası oluşturabildiği varsayılmaz; erişim yoksa blocked raporlanır. Auto layout, layer anatomy, sm/md/lg ve mevcut surface variants aynı token snapshot'ıyla web/Figma karşılaştırılır. Code'un tüm state/behavior'larının Figma'da çalıştığı iddia edilmez.
- [ ] **SF6.3 Kit:** pilot kabulünden sonra yedi komponent, foundations, örnek kullanım ve sürüm uyumluluk tablosu. Her komponentin desteklenen eksen/katman, Light/Dark ve shared değer coverage matrisi doğrulanır; dosyayı import/duplicate edip layer/property düzenleme gerçekten denenir. Kaynak `.fig`/Community teslimatı, paylaşım yetkisi, font/icon/asset hakları ve lisans/attribution kit sahibi tarafından onaylanır; private Studio'nun tamamı MIT sayılmaz.
- [ ] **SF6.4 Özel sistem aktarımı kararı:** standart starter kit ile kullanıcı JSON'unun kit'e uygulanması ayrı işler. İlk kit manuel eşleme rehberi olabilir; otomatik import/plugin ancak kullanıcı onayı ve teknik pilot sonrası. API key, network/maliyet ve Figma plan sınırlamaları araştırılmadan vaat yok.

**Pilot çıkışı:** gerçek Card dosyası/linki + sabit snapshot'a karşı eşleme ve fark kaydı. **Kit çıkışı:** gerçek erişilebilir dosya/link + yedi komponent/foundations coverage'ı, import/duplicate/edit kanıtı ve inceleyen kişi kaydı. Card pilotu tek başına tam kit kapısını kapatmaz; yalnız doküman veya JSON üretmek kit teslimatı değildir. İki yönlü sync, real-time collaboration ve plugin ekosistemi kapsam dışı.

### SF7 — Kanıta göre yeni komponentler

- [ ] SF5 kabulü sonrası eksik kullanım senaryosuna göre bir komponent seçilir (Textarea/Select/Radio yalnız aday). Hepsini paralel ekleme yok.
- [ ] Aynı API, token/katman/inspector/preview, Light/Dark, contrast, reset/import/export, registry/CLI ve Figma eşleme sözleşmesi tamamlanır.

**Çıkış:** yeni komponent mevcut deneyimi bozmadan aynı kalite kapısını geçer. SF7'nin zorunlu ürün kapısı SF5'tir; Figma kit teslimatı zorunlu önkoşul değildir. SF5 sonrasında kullanıcı/koordinatör SF6 kit ve SF7'nin sırasını belirler. Kit yoksa Figma eşleme dokümanı gerekir, var olmayan kit parity'si geçti denmez. Agent kendiliğinden kapsam genişletmez.

## 5. Paralel çalışma ve sıra

`SF0 sözleşme freeze → [SF1 || SF2 || SF3] bağımsız geliştirme → SF1+SF2+SF3 entegrasyon/kabul → SF4 → SF5 → kullanıcı kararıyla SF6 kit ve/veya SF7`

SF2/SF3, ayrılmış component dosyalarında SF1 ile paralel geliştirilebilir; System-only entegre kabulleri SF1 tamamlanmadan kapanmaz. Figma mapping araştırması ayrı read-only/dokümantasyon hattıdır.

- SF6.1 dokümantasyon araştırması SF1–SF3 ile paralel yapılabilir; final kit ve otomatik aktarım implementasyonu yapılmaz.
- SF2 ve SF3 yalnız selection/prop sınırları SF0'da sabitlenince paraleldir. `studio.tsx` ve ortak CSS entegrasyonu tek sahibindir.
- QA agent'ı bağımsız test dosyaları yazar; feature agent'ının dosyalarını eşzamanlı düzeltmez. Ortak smoke dosyaları entegrasyon dalgasında tek yazıcıyla güncellenir.
- Ayrı worktree/branch ile çalışma tercih edilir; agent'lar onaysız commit/branch/publish yapmaz. Tek çalışma ağacında disjoint write set zorunludur.
- Ana build, generator ve consumer testleri tek çalışma ağacında seri çalıştırılır. Ortak write-set yalnız `.next/out` değildir: `public/registry`, `public/bambiui-source`, `app/studio/source-catalog-meta.json`, `packages/cli/dist` de paylaşımlıdır. D validation sırasını yönetir, A entegrasyon revizyonunu sabitler. Aynı dosyalarda edit sürerken final kabul çalıştırılmaz; browser süreçleri temizlenir.
- Başlangıç görevleri, prompt'lar ve handoff formatı [uygulama planında](system-first-execution-plan.md).

## 6. Askıya alınan işler

Önceki ID'ler yalnız izlenebilirlik için korunur:

| Eski iş | Yeni durum |
| --- | --- |
| B01/B02 Project+System bundle/import | Askıda; mevcut veri silinmez. System JSON import/export aktif kalır. |
| P01–P03 ekran şablonları / Project doğrulama | Askıda; System matrix ve consumer fixture'ları aktif doğrulama yolu. |
| D03 seçili frame source | Askıda. CLI komponent kaynağıyla karıştırılmaz. |
| R01–R03 custom definition / linked master | Askıda; mevcut built-in token editing tamamlanmadan başlanmaz. |
| V01/V02 Project release pin/update UI | Askıda; CLI immutable registry pin/retention aktif kalır. |
| B03 System storage safety | SF5'e daraltılarak taşındı; Project yeniden açılmaz. |
| S01–S03 eski UX kabul | Kanıtları korunur; yeni SF2–SF5 kabulüyle tamamlanır. |

Project yeniden açılacaksa ayrı kullanıcı kararı ve yeni roadmap gerekir. Figma kit için uygulama içinde page builder üretmek bu askıya alma kararını dolanmak olur.

## 7. Doğrulama ve done tanımı

Her dilim: hedefli unit/SSR + davranış browser testi, lint/TypeScript, gerekli production static build ve diff kontrolü. Public token/API değişirse AGENTS'taki docs/specimen/audit/source güncellemeleri aynı dilimde. UI-only dilimde dağıtılan component kaynakları ve registry hash'i gereksiz değişmez.

```sh
node --test app/studio/*.test.mjs app/studio/composer/*.test.mjs app/studio/page-document/*.test.mjs app/examples/page-editor/*.test.mjs
npm run test:cli
npm run test:browser-process
npm run lint
npm run build
npx tsc --noEmit --incremental false
node scripts/generate-source-catalog.mjs --check
node scripts/generate-registry.mjs --check
# Run after the stable main production build:
npm run test:system-only
node scripts/studio-smoke.mjs
node scripts/studio-source-smoke.mjs
npm run check:cli
# Retention regression includes a published npm client; requires network:
npm run check:registry
# Explicit network acceptance; published baseline, not unpublished local edits:
npm run check:cli:clean
```

SF1 System-only smoke eklendi ve mevcut System/source smoke'un route varsayımları güncellendi. Yukarıdaki komut gerçek `test:system-only` script'idir; browser check kendi build başlatmaz. Workspace/composer browser scriptleri eski public route'a göre çalıştığı için varsayılan yeni UI gate'i olamaz. D eski senaryoları `System-only'a taşındı / legacy model testiyle korunuyor / authoring askıda` olarak tek tek eşler; askıya alınmış browser senaryosunu geçti saymaz. Internal test fixture gerekirse static public export'a dahil edilmez; query/env bayrağıyla public Project açma yolu yok. Eski model/unit/SSR testleri tutulur. Başarısız testi sırf yeşile çevirmek için silme veya geniş skip ekleme yok.

Done: değişiklik özeti, değişen dosyalar, test komutları/sonuçları, manuel kanıt veya açık eksik, data/compatibility etkisi ve sonraki bağımlılık handoff'ta yazılı. Publish, commit, deploy ve gerçek Figma oturumu yapılmadıysa açıkça belirtilir.

## 8. Güncel uygulama kanıtı ve açık kapılar

**Size-scope amendment · 2026-10-16:** UI-only `recipe-edit-scope.ts` mevcut exact kayıtlar üzerinde color/exact ve non-color/size-group yazım/reset kapsamını uygular. Tüm yedi komponent ve her consumed field/recipe/part/target için üyelik testi; Text variant koruması ve conditional error kapsamı mevcut. Inspector seçili örneğin gerçek değerini ve ayrı write scope'u gösterir. Seçili kayıtta override yokken yalnız peer override'ı için de reset/clear çalışır; inspection/import tarihi farkları normalize etmez. Tek callback/Undo grubu kullanılır.

- 637 app unit/SSR/source + 26 CLI/arşiv testi; build/TypeScript/lint ve catalog/registry freshness geçti. Yeni size token/schema/pure resolver/public API değişmedi; registry source release aynı kaldı.
- 99 System browser kontrolü: Button outline.sm non-color alanları altı small variant'ta paint+stored eşitliği, md/lg ve diğer parts korunması; Text paragraph.sm fontlarının altı tone'a yayılması, diğer tipografik variant/size'ların korunması; exact/theme renkleri, scoped reset, tek-adım Undo/Redo. Animasyonlu Button color paint assertion'ı transition sonrasını bounded wait ile doğrular.
- 17 System-only ve 7 source/CLI browser senaryo grubu geçti. Card md grubunda üç surface variant güncellenir; divergent eski kayıtlar yalnız inspection'da aynı kalır ve Undo ile aynen geri gelir. Preview export izolasyonu korunur.
- Yeni davranış commit/deploy edilmedi; manuel task/VoiceOver/native zoom kabulü ve Figma authoring açık. Eski kapsam baseline'ı aşağıdadır.

### System-only ilk dilim baseline'ı

**Kanıt sınırı:** Aşağıdaki kayıtların tarih/sayı/hash kimlikleri korunmuştur; superseding kullanıcı amendment'ından önceki uygulamayı anlatırlar. Yeni fan-out/reset/scope davranışı için henüz yeni doğrulama iddiası yoktur.

**System-only ilk dilim · 2026-10-16:** A/B/C/D/E ayrılmış alanlarda çalıştı; koordinatör SF0'ı QA review sonrası dondurdu ve entegrasyonu doğruladı. SF1 ve SF2 uygulaması tamam; SF3 browser performans profiling ve SF4 tüm kombinasyonlarda insan kabulü açık. Generic inspector yedi komponenti destekler; bu, tüm 294 kombinasyonda insan görsel kabulü yapıldığı anlamına gelmez.

- 615 app unit/SSR/source testi, 26 CLI/arşiv testi ve 5 browser-process regresyonu geçti; eski composer/page-document model testleri korundu.
- Production static build, TypeScript, lint ve source-catalog/registry freshness geçti. Registry release hâlâ `f8c9659b67ea08923f7300577db326c63baa61cad3b04e9576ae0b10c945a709`; dağıtılan component/pure resolver kodu değişmedi.
- 17 yeni System-only browser senaryosu: route/tek shell/404, legacy bytes/recovery/privacy/error, fail-closed refs, unrelated-system deletion, Cancel/Escape/focus, double-accept, gerçek ikinci-sekme yazımı açık delete dialog'unu bloklama; Card exact/filter/pointer-draft/session-preview CSS/JSON izolasyonu ve 390px.
- Desktop Card.Title inspector, 390px overlay inspector ve 390px recovery ekranı screenshot'ları `.next/color-review/system-first-*.png` altında yakalanıp görsel olarak incelendi. Bu, piksel-regresyonu veya gerçek cihaz/native zoom kabulü değildir.
- 97 System smoke kontrolü ve 7 source/CLI browser senaryo grubu geçti. ZIP'in tüm üyeleri session Preview öncesi/sonrası aynı saved snapshot'la eşleşti. Native delete confirmation yeni controlled Base UI dialog'una taşındı; fixed delay ile hatayı maskeleme yapılmadı.
- Yerel CLI React/Next/browser tüketicisi, published 0.2.0 → local 0.2.1 archived-pin retention regresyonu ve tekrar fresh npm React/Vite → Next published 0.2.1 consumer geçti. Sonuncusu yayımlanmış baseline'ı test eder, private UI deployment kanıtı değildir.
- Legacy workspace/composer/page-editor authoring browser scriptleri açık dormant mesajıyla normal çağrıda exit=2, help'te exit=0; bunlar geçti sayılmadı. Yeni UI gate `npm run test:system-only`.
- System stale-tab overwrite/quota/retry sağlamlaştırması ve gerçek kullanıcı/VoiceOver/native zoom/IME kabulü açık. Figma dokümanı [figma-kit-contract.md](figma-kit-contract.md); gerçek kit ve authoring erişimi yok. Commit/publish/deploy yapılmadı.

### Önceki yayın baseline'ı

- npm 0.2.1/MIT/latest ve production registry doğrulandı; Develop deploy'u 0.2.1 komutlarını sunuyor.
- Fresh npm consumer: React/Vite ve ardından Next build/browser geçti; workspace cleanup sonrası üç tam koşu 23/23 + temiz exit, beş proses regresyonu geçti.
- Önceki yayın kanıtı tek başına System-only kabulü değildir; güncel uygulama sonucu yukarıda ayrı kaydedildi. [Aktif kabul protokolü](studio-acceptance.md) hedef System-only görevlerini içerir; SF0 sonrası D gerçek aday UI ile eşler. [Eski Project protokolü](studio-acceptance-history-2026-10-16.md) arşivdir, yapılmış kullanıcı testi değildir; yeni kabul kapısı olarak kullanılmaz.
- Manuel VoiceOver/native zoom/gerçek kullanıcı kabulü yapılmış değildir. Önceki detaylar [tarihsel roadmap](roadmap-history-2026-10-16.md) ve [CLI kayıtları](cli-registry.md).
