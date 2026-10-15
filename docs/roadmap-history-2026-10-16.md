# bambiui · tarihsel roadmap (2026-10-16 öncesi yön)

**ARŞİV:** Aşağıdaki durumlar ve görev sırası tarihsel kayıttır. Project'i sürdürme ve Project-first kabul önerileri artık aktif değildir. Güncel kapsam [roadmap.md](roadmap.md), agent görevleri [system-first-execution-plan.md](system-first-execution-plan.md). Test/yayın kanıtları kendi tarihlerinde korunmuştur.

Güncelleme: 2026-10-14 · İncelenen kod tabanı: `97725b3` (`feat(studio): show rendered appearance values`).

Bu belge arşivlendiği dönemde kapsam ve iş sırasının kaynağıydı; artık aktif plan değildir. Aşağıdaki işler, developer/design-system odaklı yön görüşmesinden çıkan uygulama önerisidir; henüz yapılmış özellikler veya bütün ayrıntıları onaylanmış ürün kararları değildir. Bu güncelleme yalnız plan ve dokümantasyondur.

[Composer uygulama defteri](studio-composer-execution-plan.md) C00–C12'nin teknik geçmişini, [önceki ürün/backend planı](interface-composer-plan.md) eski seçenekleri, [UX incelemesi](studio-ux-audit-plan.md) tarihsel bulguları korur. Eski belgelerdeki görev sırası ve test sayıları bu planın önüne geçmez. Veri/API sözleşmelerinde [component-api.md](component-api.md), [page-document.md](page-document.md) ve [reusable-components.md](reusable-components.md) esas alınır.

## 1. Ürün odağı

> Tasarım sistemini görsel olarak oluştur, çalışan komponentlerle gerçek ekranlarda doğrula ve React projende kullan.

- **Birincil hedef kullanıcı önerisi:** frontend developer, design engineer ve tasarım–geliştirme işini birlikte yürüten küçük ürün ekipleri.
- **Ana ürün System'dir.** Komponent kuralları, tokenlar, variant/size/state, tema, erişilebilirlik ve kod teslimatı burada geliştirilir.
- **Project devam eder.** Sistemin gerçek içerik, layout ve farklı genişliklerde kullanılmasını/doğrulanmasını sağlar; ayrı bir genel amaçlı sayfa tasarım ürünü olarak büyütülmez.
- Figma'ya tanıdık seçim, katman, frame ve inspector davranışları korunur. Vektör araçları, sınırsız serbest node konumlandırma ve Figma özellik paritesi hedef değildir.
- İlk başarı ölçütü canvas'taki özellik sayısı değil, **sistem oluştur → ekranda dene → kodu gerçek uygulamada kullan** döngüsünün tamamlanmasıdır.
- Yeni bir shell revizyonu veya mevcut editörün yeniden yazılması planlanmıyor. `/` ve `/pages` davranışı bu planla değiştirilmez; başlangıç/onboarding akışı ancak görev testiyle gerekçelendirilir.

## 2. Bugün gerçekten var olanlar

| Alan | Mevcut durum | Bir sonraki açık |
| --- | --- | --- |
| Sistem ve tema | Ayrı sistemler, schema v3, Light/Dark renkleri; ortak geometri/tipografi; CSS/JSON export/import | Taşınabilir komponent kaynak teslimatı ve sistem kayıt güvenliğinin proje seviyesine getirilmesi |
| Komponent düzenleme | Button, Input, Switch, Checkbox, Card, Badge, Text; 294 exact kombinasyon; frame/text katman seçimi | Kapsam/kaynak/etki bilgisini daha anlaşılır sunma ve etkileşim durumlarını gözden geçirme |
| Inspector | Gerçek hesaplanan değerler; authored değerler ayrı; reset mirası geri açar; ortak farklı değerlerde Mixed | Kaynağı isteğe bağlı açıklama; değerleri tekrar Inherited etiketine dönüştürmeme |
| Parametreler | System Parameters yeni eklemelerin varsayılanlarını, Project Parameters mevcut instance'ı düzenler | Bu ayrımın görev testlerinde anlaşılır olduğunu doğrulama |
| Project | Çoklu sayfa, bağımsız frame, Stack/Grid, auto layout, canvas insertion/move, Actions, katmanlar, Undo/Redo | Gerçek kullanım örnekleri, taşınabilir yedek/import ve seçili frame kaynak UI'sı |
| Sistem bağlantısı | Proje systemId ile canlı sistemi tüketir; açık rebind içerik/layout'u korur | Yayınlanmış sistem sürümüne sabitleme ve kontrollü güncelleme yok |
| Saved components | Proje içi bağımsız snapshot/template; fresh-ID kopyalar; sistem tokenlarını tüketir | System'e ait bağlı tanım/instance modeli ve projeler arası ortak komponent yok |
| Kaynak üretimi | PageDocument → TSX; kullanılan kaynak/CSS/tema/bağımlılıkları toplayan build-time script; consumer fixture | Son kullanıcıya açık System/frame kaynak paketi indirme akışı ve temiz kurulum kabulü yok |
| Kayıt ve yedek | Projede autosave, revision/çatışma koruması, hata/retry ve JSON indirme; sistem JSON'u ayrı | Proje JSON'u yalnız systemId taşır; tam project+system backup/import yok |
| Responsive | Frame'ler bağımsız ağaçlar; intrinsic Stack/Grid; Grid'in mevcut sabit container eşiği | Breakpoint editörü veya bağımsız frame'lerden otomatik responsive uygulama çıktısı yok |

**Önemli ayrımlar:** System JSON `version: 3` bir veri şeması sürümüdür, ürün/sistem release sürümü değildir. Project storage revision bir kayıt çakışması sayacıdır, component library sürümü değildir. Saved component kopyası bir master instance değildir. Frame genişliği browser viewport/breakpoint değildir.

### Kod dayanakları

- System: `app/studio/component-matrix.tsx`, `system-component-editor.tsx`, `component-recipes.ts`, `component-styles.ts`, `tokens.ts`, `systems.ts`.
- Görünen değerler: `app/studio/rendered-appearance.ts`, `use-canvas-appearance.ts`, `composer/appearance-inspector.tsx`.
- Project: `app/studio/composer/model.ts`, `controller.ts`, `storage.ts`, `project-ui.tsx`, `assets.ts`.
- Kaynak: `app/studio/page-document/export.ts`, `bundle.ts`, `registry.ts`, `scripts/page-source-files.mjs`, `scripts/check-page-source.mjs`.

## 3. Değişmeyecek sorumluluk sınırları

| İşlem | Sahibi / etkisi |
| --- | --- |
| Medium Card başlığının fontunu değiştirmek | System'de ilgili exact kombinasyon/katman; onu tüketen bağlı kullanımlar |
| Yeni Card eklemelerinin başlangıç başlığını değiştirmek | System Parameters; yalnız sonraki built-in eklemeler |
| Bir ekrandaki Card başlığını değiştirmek | Project Parameters; yalnız seçili instance |
| Kartları iki sütuna dizmek, frame padding'i değiştirmek | Project layout/frame; diğer frame ve sistem değişmez |
| Tekrar kullanılacak yeni bir kompozisyon tanımlamak | Gelecekte System component definition; bugünkü snapshot ile karıştırılmaz |
| Sistem editöründe başka sisteme bakmak | Açık projenin systemId bağlantısını değiştirmez |

- Project'in built-in komponentlerine yeniden kapsamlı yerel stil paneli eklenmez. Eski `appearance`/`parts` kayıtları korunur ve açık reset yolu kalır; layout/frame görünümü düzenlenebilir.
- Reset bir override'ı kaldırır; bugünkü hesaplanan değeri kalıcılaştırmaz. Bakma, seçim, focus/blur ve no-op düzenleme kayıt/history üretmez.
- Renkler tema bazlı; non-color değerler iki temada ortak kalır. Yeni alanlar yalnız gerçek CSS tüketicisi, import/reset/export/audit ve testleriyle eklenir.
- Local-first ve statik dağıtım korunur. Kaydedilen JSON keyfi CSS/JS, callback veya executable kod kabul etmez.
- Bağımsız frame'ler tek ağaca zorla dönüştürülmez. Çoklu responsive runtime eşlemesi ayrı karar olmadan uygulanmaz.

## 4. Sıralı iş listesi

Öncelik takvim tahmini değildir. Her madde küçük, doğrulanabilir PR'lara ayrılır. **Aktif çalışma sınırı: bir ürün dilimi;** bağımsız test/dokümantasyon işleri paralel ilerleyebilir. Genişletme işine geçmeden önce mevcut dilimin kabul kapısı kapanır.

### M1 — System düzenleme deneyimini tamamla

**Amaç:** daha fazla kontrol eklemek değil, mevcut kontrollerin neyi değiştirdiğini anlaşılır kılmak.

- [~] **S01 · Kapsam, kaynak ve etki.** Seçili komponent/variant/size/katman bağlamını kısa ve tutarlı göster. Gerçek değer alanın içinde kalsın; kaynağı ve reset hedefini isteğe bağlı detayda açıkla. Exact styles, shared defaults, base/variant tokens ve eski instance override'ları aynı şeymiş gibi sunulmasın. Bağlı projelere etkisi anlaşılır olsun; her tuş vuruşunda onay penceresi çıkarma.
- [~] **S02 · State inceleme akışı.** Hover/active/focus, disabled/loading, invalid/readonly gibi desteklenen durumları gerçek komponentlerde kolay incele. Mevcut 294 kombinasyonu gereksiz state eksenleriyle büyütme; geçici preview durumu, insertion defaults veya yeni recipe kaydı olmasın. Focus göstergesi dekoratif border'dan ayrı kalır.
- [~] **S03 · Tutarlı inspector davranışı.** Birim, sayı sınırı, hata, mixed, reset ve klavye davranışlarını tüm stil alanlarında gözden geçir. Uzun shadow/değerler, küçük panel genişliği ve hesaplama sırasında devam eden draft'lar için görünürlük kabulü ekle.

**Manuel oturum:** [System/Project kabul protokolü](studio-acceptance.md) T01–T06 görevlerini, ayrı klavye/VoiceOver/native zoom kontrollerini ve sonuç/issue kaydını tanımlar. Protokol hazırlanmıştır; gerçek katılımcı veya manuel erişilebilirlik sonucu henüz kaydedilmemiştir. S01–S03 bu yüzden kısmi kalır.

**Kabul:** kullanıcı yalnız `outlined.md / Card.Title` fontunu değiştirir; hangi kullanımların etkilendiğini anlar; diğer size/variant/katmanlar korunur; reset/undo/tema değişimi doğru değeri gösterir. Input Error ve Button state senaryoları da geçer. Kaynak açıklaması computed CSS'ten tahmin edilmez; metadata/resolver sözleşmesiyle doğrulanır.

**Dosya alanı:** `system-component-editor.tsx`, `component-matrix.tsx`, `studio.tsx` içindeki base/variant kontrolleri, ilgili CSS/copy ve testler. Resolver/model yalnız gerekli ve testli ölçüde genişler; schema yeniden yazılmaz.

**S01 uygulama kaydı · 2026-10-14:** Exact/shared/base/insertion kapsam etiketleri ve kapalı başlayan read-only kaynak/reset açıklamaları eklendi. `style-sources.ts` direct exact/shared declaration ve height'tan üretilen minimum kaynağını ayırır; son component/parent CSS cascade'i tahmin edilen token yerine açık fallback sınırıdır. Card slot descendant ayrımı, tema kapsamı ve no-op/reset/history davranışı korunur; public API/token şeması değişmedi. 547 test, 94 System browser kontrolü, build/lint/TypeScript geçti. Workspace script'i iki çalıştırmada da 23 senaryoyu ve cleanup'ı başarıyla logladı, fakat terminal aracı komut kapanışında 240 saniyelik timeout bildirdi; temiz process-exit kabulü açık olarak kaydedilir. Gerçek kullanıcı görev testi ve manuel assistive-technology/native zoom kabulü yapılmadığı için S01 kısmi işaretli; sıradaki aşamalar otomatik başlatılmaz.

**S02 uygulama kaydı · 2026-10-14:** Seçili Button/Input/Switch/Checkbox örneğinin altında kapalı başlayan `Test interaction states` eklendi. Tek gerçek komponent açıkken mount olur; hover/pressed/focus native etkileşimle, disabled/loading/readonly/indeterminate desteklenen public props ile incelenir. Button aktivasyonu focus'u koruyarak loading'e girer. Preview input/checked/condition verileri yalnız React oturum state'idir; kapanış/reset temizler, layer/theme/view değişimi aynı recipe oturumunu korur. Live recipe gerçek DOM state'inden okunur ama edit scope'u değiştirmez; inspector ve seçim işaretleri yalnız özgün `data-recipe-body` anatomisini kullanır. 294 katalog anahtarı, public API, token/import/export modeli değişmedi. Son doğrulama: 558 unit/SSR/source testi, 96 System browser kontrolü, production build, lint, TypeScript ve diff kontrolü geçti. Gerçek Chromium pointer hover/hold/release, loading focus/repeat-block, native Tab focus ring, Input typing/readonly ve choice disabled/readonly/indeterminate, reset ve sıfır token write test edildi. Desktop açık Button önizleme screenshot'ı incelendi; preview typography'sinin gerçek component system'inden geldiği test edildi. S02 turunda workspace/composer drag/ayrı consumer scriptleri yeniden çalıştırılmadı; S01'in workspace process-exit timeout'u ayrıca açık kalır. Gerçek kullanıcı/VoiceOver/native zoom/cross-browser kabulü henüz tamamlanmadığı için kısmi işaretlidir.

**S03 uygulama kaydı · 2026-10-14:** Metadata-backed exact/shared System styles ve Project layout/frame appearance aynı draft validation/alan rehberi sözleşmesine bağlandı. Uzunluk px, lineHeight × ve opacity 0–1 göstergeleri; native read-only ⓘ tam değer/aralık/reset açıklamaları; dimension hug/fill önerileri; alana bağlı inline hata ve aria-describedby eklendi. Renk/shadow tam satır, açık yardım/hata grid genişliğine açılır; input remount edilmez. Unitless alanların yanlış pixel hata mesajı düzeldi; kesirler/sınırlar/allowlist ve serialized schema korunur. System reset başarısız olsa da bekleyen taslak blur ile kaydedilmez. Son doğrulama: 566 unit/SSR/source testi, 97 System ve 23 workspace browser kontrolü, production build, lint, TypeScript ve diff kontrolü geçti; workspace komutu bu turda temiz exit ile tamamlandı (S01'deki kapanış timeout'u son çalıştırmada tekrarlanmadı). Chromium'da doğru birim/sınır ve bağlı hata/hint ID'leri, full precision okuma, pending invalid draft reset/undo, sıfır help-write, 390px shadow satır sarma ve Project invalid/reset/theme akışı test edildi. Desktop tam değer yardımı ve mobil shadow screenshot'ları incelendi. Ayrı composer drag/source-consumer scriptleri bu turda yeniden çalıştırılmadı; gerçek kullanıcı/VoiceOver/native zoom kabulü açık olduğu için kısmi işaretlidir.

### M2 — Geliştiricinin kullanabileceği kaynak çıktısını teslim et

**Amaç:** CSS değişkenleri veya örnek import'un ötesine geçip gerçek uygulamaya taşınabilir çıktı vermek.

**2026-10-15 kullanıcı kararı:** Ana yol **CLI + statik registry** oldu. [CLI sözleşmesi](cli-registry.md) güncel teslimat sınırıdır. D01/D02 ZIP çalışması korunur ama Develop'ta kapalı başlayan manual fallback'tir; D03 frame ZIP bekletildi.

- [x] **C01 · CLI/registry sözleşmesi.** Node 22.15+, React/TypeScript/CSS Modules, explicit trusted registry URL, immutable pin + resolver fingerprint, local System JSON ve conflict/dry-run sınırları tanımlandı.
- [x] **C02 · Statik registry üretimi.** Aynı source collector'dan `public/registry/index.json` + content-addressed release; dev/build hook, strict validation ve hash/byte kontrolü. Kullanıcı verisi upload edilmez.
- [x] **C03 · Yerel CLI ve Develop akışı.** Ayrı `packages/cli` paketinde init/add/theme, exact closure, local file protection ve paketlenmiş executable. Hedef npm adı `bambiui`, başlangıç sürümü `0.2.0`; Next root package private kalır. Develop yerel komutları kopyalar ve yayın durumunu açıklar; ZIP ikincildir.
- [~] **C04 · Public yayın ve temiz consumer kabulü.** Npm ownership/auth, lisans/attribution, üretim registry adresi ve eski immutable release URL'lerinin deployment retention'ı doğrulanır. Temiz React/Next dependency install, elle erişilebilirlik ve yayınlanmış `npx bambiui@0.2.0` kabulü yapılır. MIT kapsamı onaylandı; `prepublishOnly` doğru MIT notice/build ile geçer. Maintainer auth doğrulandı; incelenen 0.2.0 tarball'ı için publish isteği npm 2FA/EOTP ile reddedildi. Kullanıcı sonrasında yayını tamamladı: npm 0.2.0/MIT/latest ve SHA-512 eşitliği doğrulandı; public npm CLI ile init/add/theme + React/Next/browser tüketicisi geçti. Production registry index/release 200 JSON, SHA-256/byte eşitliği ve gerçek npm CLI init/add/theme ile doğrulandı. Git-tracked release arşivi ve temiz/future-release build retention regresyonu uygulandı; kullanıcı deploy'u tamamladı ve eski URL arşivle birebir aynı kaldı. Npm 0.2.1/MIT/latest ve tarball bütünlüğü doğrulandı; public CLI React/Next/browser consumer geçti. `npm run check:cli:clean` ile public 0.2.1 + production registry kaynakları repo dışındaki boş host/cache içinde sıfır npm install, bağımsız React/Vite type-check/build/browser ve ardından Next install/build/prerender/browser kontrollerini geçti. Farklı source release'ler arasında canlı retention gözlemi ve manuel kabul hâlâ açık.

- [x] **D01 · Teslimat sözleşmesi.** [Kaynak teslimatı sözleşmesi](source-delivery.md) System/seçili frame dosya düzenini, dependency closure, snapshot-scoped iki tema, manifest/snapshot, React/Next kurulumu ve state/form sınırlarını tanımlar. İlk arşiv yöntemi browser ZIP STORE; yeni runtime bağımlılığı/server yok. D01 tasarım dilimidir; System indirmesinin uygulama kanıtı aşağıdaki D02 kaydındadır. Registry/CLI/npm release ilk adım değildir; public lisans kapısı açık.
- [x] **D02 · System kaynak paketi.** System/Develop `React source` seçili komponenti veya mevcut yedi komponenti ZIP indirir; yalnız CSS değişkenleri olmadığı açıkça belirtilir. Ortak Node source collector + build-time immutable catalog + lazy browser assembler; browser'da node:fs/TypeScript AST veya gizli server yok. Scoped iki tema, populated example, snapshot, strict manifest, pinned dependency ve kurulum bilgisi pakete dahil. Store hazır olmadan indirme yok; capture/fetch/hash/ZIP storage/history'ye dokunmaz.
- [ ] **D03 · Seçili frame kodu — bekletildi.** CLI/registry önceliği nedeniyle henüz uygulanmaz; komponent registry'si Project/frame backup formatına dönüştürülmez. Mevcut `composerFrameToPageDocument` adapter'ı ve aynı export motoruyla seçili frame'i Develop/download akışına bağla. Project'in bağlı sistemini kullan; System editörünün activeId'sini değil. Export başlamadan tek bir tutarlı frame+system snapshot'ı yakala.
- [~] **D04 · Gerçek consumer kabulü.** Temiz React+TypeScript/CSS Modules uygulaması ve Next tüketicisiyle kurulumu doğrula. Node kaynakları, CSS, Light/Dark, exact recipe ve shared defaults, Card slotları ve form semantiği korunsun. Kaynak içeriğine Studio runtime/state/import sızmasın. Kaynak paketinin snapshot-scoped tema izolasyonu, mevcut normal CSS export'unun `:root` davranışından ayrımı, opt-in Google Fonts ve uygulama davranışının geliştirici tarafından bağlanacağı açıkça belgelenir.

**Kabul:** kullanıcı bir Button/Card/Input sistemini ve bir frame'i indirip bambiui servisi olmadan derler ve render eder. Canvas koordinatları/clipping/selection overlay çıktıya taşınmaz; preview için konulan root yükseklik/padding varsayımları tüketiciye sessizce dayatılmaz. Tek frame export'u otomatik responsive çoklu-frame uygulaması diye sunulmaz. Hızlı kaynak consumer testi installed node_modules'u tekrar kullanır. Ayrı `check:cli:clean` public CLI/production registry ile fresh install ve React/Vite → Next build/browser kanıtını sağlar; seçili frame teslimatı ve manuel kabulü kapsamaz.

**Güncel bağımlılık:** C01 → C02/C03 → C04. D01/D02'nin resolver/collector altyapısı yeniden kullanılır; D03 ayrı sonraki frame teslimatı işidir. D04'ün temiz consumer kabulü C04 CLI yoluna uyarlanır; mevcut installed-node_modules build/browser testleri bunun yerine geçmez.

**D01 uygulama kaydı · 2026-10-14:** `source-delivery.md` teslim edildi; ZIP STORE yöntemi, build-time source catalog + lazy same-origin browser assembler, sabit güvenli dosya adları, deterministik manifest/hash ve snapshot scope'u kararlaştırıldı. Normal `exportCSS()` geriye uyumlu kalır; source paketi host `:root`/body'yi boyamaz, frame'e ek padding/min-height/canvas ölçüsü dayatmaz. 128 dosya / 5 MiB payload başlangıç sınırı D02 uygulama/test hedefidir; mevcut 1 MiB PageBundle sınırı değişmez. Prototip ölçümleri account-settings 23 dosya / 252.166 UTF-8 byte, design-safe 27 dosya / 259.497 byte. 11 source/bundle testi ve `node scripts/check-page-source.mjs --browser` geçti: React tip kontrolü, bağımsız Next build/prerender, Light/Dark CSS/native form/state/reflow ve yedi komponent hydration. Consumer kurulu node_modules'u kullanır; temiz kurulum veya yeni scoped ZIP kabulü değildir. Markdown yerel dosya bağlantıları ve diff kontrolü geçti. D02/D03/D04 henüz uygulanmadı; lisans/public dağıtım ve M1 manuel kabulü açık.

**C01–C03 uygulama kaydı · 2026-10-15:** CLI + statik registry uygulandı; hedef paket `bambiui@0.2.0`, root Next package ayrı/private. Init/add/theme, local JSON resolver reuse, immutable registry/resolver pins, gerçek source closure (Card örnek bağımlılıkları hariç), safe file planning/rollback/conflict/dry-run ve explicit package.json dependency yönetimi eklendi. 581 unit/SSR/source ve 16 CLI testi geçti. Gerçek packed CLI ve local tarball üzerinden offline npm exec 0.2.0 doğrulandı; publish yapılmadı, license/build prepublish gate test edildi. CLI ile kurulan kaynaklar standalone React type-check + ayrı Next build/hydration, shared exact Card edge/title/Input error stilleri, Light/Dark ve native choice/reflow kontrollerini geçti; kurulu node_modules kullanır, C04 clean install değildir. Build/lint/TypeScript/catalog+registry freshness, 97 System ve altı CLI/source browser senaryo grubu temiz exit ile geçti. Develop primary CLI komut kopyalama, static HTTP release hash/bytes ve kapalı ZIP fallback doğrulandı; mobil screenshot incelendi. Eski first-code-block test varsayımı ayrıldı, gerçek download completion event'i beklenir. Project workspace/composer drag/legacy page-consumer bu turda yeniden çalıştırılmadı; D02 workspace exit timeout ve C04 public lisans/npm/prod registry retention kapıları açık.

**D02 uygulama kaydı · 2026-10-15 (önceki ZIP turu):** Kaynak ZIP UI/motoru ve build hook/freshness testleri uygulandı. Node prototype ile tek import grafiği kullanılır; catalog yalnız indirmede same-origin yüklenir, kullanıcı snapshot'ı server'a gönderilmez. 581 unit/SSR/source testi (15 yeni source testi), production build, TypeScript, lint ve catalog freshness geçti. Standard Python ZIP reader Unicode/empty payload/CRC/corruption ve limitleri doğruladı. Yeni System consumer standalone React tip kontrolü, ayrı Next build/hydration, host/two-system/nested-theme izolasyonu, exact typography/native states/choice toggle ve 1440/768/390 geometriyi geçti; kurulu node_modules'u kullanır, D04 değildir. Gerçek Card/all-seven/Text ZIP browser indirmeleri, pending selection navigation, zero storage-write, missing catalog/retry ve mobile reflow geçti; mobil screenshot incelendi. Son kontrolde stale out preflight'ı sonrası güncel build alındı; generator'ın aynı descriptor/catalog'u yeniden yazmasını önleyen timestamp regresyonu eklendi. 97 System ve yeni source-download kontrolleri temiz exit ile geçti. Son workspace çalıştırması 23 senaryo ve cleanup başarısını logladı, fakat terminal komutu kapanışta 240 saniyelik timeout aldı; workspace process-exit kabulü yeniden açık (önceki temiz D02 çalıştırması bu son sonuç yerine geçmez). D03/D04, lisans/public dağıtım ve M1 manuel kabulü açık; eski page-consumer browser ve ayrı composer drag bu turda yeniden çalıştırılmadı.

### M3 — Taşınabilir yedek ve sistem veri güvenliği

**Amaç:** yapılan tasarımın yalnız bu tarayıcıya bağlı kalmaması; hatalı import veya ikinci sekmenin emeği kaybettirmemesi.

- [ ] **B01 · Project bundle.** Ayrı sürümlü backup envelope: proje, sayfalar/frame'ler, assets ve bağlı sistemin tam snapshot'ı. Eski raw project JSON ve tek-page bundle için açık import/adaptasyon yolu; eksik sistem sessiz default ile değiştirilmez.
- [ ] **B02 · Güvenli import.** Önce tüm paketi doğrula, sonra etki önizle. İlk öneri mevcutları değiştirmeden yeni proje+yeni sistem olarak almak; var olan sisteme bağlama açık seçim olsun. Project/system ID çakışmaları ayrı çözülür. Eski kayıtların üzerine sessiz yazma veya otomatik snapshot birleştirme yok.
- [ ] **B03 · System kayıt güvenliği.** `systems.ts` koleksiyon kaydı için Project'teki korumalara denk stale-write/iki-sekme, quota, bozuk kayıt ve retry davranışını tamamla. Çok anahtarlı localStorage yazımını atomikmiş gibi sunma; project+system import'unun yarım kaldığı durumları tanımla ve kurtar. Geçmişin referans verdiği sistemleri silme/rebind politikası netleşmeden koruyucu engelleri kaldırma.

**Kabul:** temiz browser profilinde yalnız paket import edilerek aynı sistem ve tüm frame'ler açılır. Bozuk/gelecek sürümlü paket, ID çakışması, yazma hatası veya eski sekme mevcut kayıtları bozmaz; in-memory çalışma indirilip kurtarılabilir. Import sonrası selection/history politikası açık ve testlidir.

**Sıra:** B01 sözleşmesi D01 ile birlikte netleştirilebilir; B03 ve D02 bağımsızdır. **M2 + M3 + ilgili manuel kabul kapısı kapanmadan dış kullanıcı beta'sı tamamlandı denmez.**

### M4 — Project'i sistem doğrulama alanı olarak güçlendir

- [ ] **P01 · İsteğe bağlı gerçek ekran şablonları.** İlk iki görev: hesap/ayarlar formu ve kart/istatistik ağırlıklı basit dashboard. Mevcut registry ve System Parameters'ı kullan; otomatik demo proje oluşturma. Kullanıcının farklı sistemine bağlandığında şablon içeriği korunur ve gerçek komponentler yeni sistemi tüketir.
- [ ] **P02 · Genişlik ve içerik stres testi.** Uzun Türkçe/İngilizce metin, hata mesajı, büyük tipografi, dar/geniş container ve iki tema ile doğrula. Taşma, kesilme ve geçersiz slotları yakala. Mevcut bağımsız frame kuralını koru; responsive ihtiyacı için önce tek frame içindeki intrinsic layout davranışını netleştir.
- [ ] **P03 · Sistem değişikliğini gerçek ekranda kontrol et.** İlgili Project'e gidip aynı katmanı bulma/dönme akışını kolaylaştır. System değişimi sonrası iki bağlı projede etkiyi incele; içerik ve instance parametreleri değişmesin. Global token contrast sonucu yerel renk/opacity/nested surface için otomatik erişilebilirlik onayı sayılmaz.

**Kabul:** kullanıcı kendi sistemini iki farklı ekranda dener; gerçek bir token/recipe sorunu bulup System'de düzeltir; projelerin içerik/layout'u bozulmadan sonucu görür ve M2 çıktısını kullanır. Yeni layout özelliği yalnız bu görevlerde eksikliği kanıtlanırsa eklenir.

### M5 — System'e ait yeniden kullanılabilir komponent tanımları

**Bu yeni bir ürün/veri modeli işidir; mevcut saved assets için otomatik migration değildir.**

- [ ] **R01 · Definition/instance sözleşmesi.** System'e ait tanım kimliği, kök kompozisyon, izinli props/slotlar, varsayılan içerik, stil kapsamı ve referans kurallarını küçük bir örnek üzerinde tanımla. İlk örnek: Card + Text + Badge/Button'dan `AccountSummary` kompozisyonu. Raw JSX/callback, keyfi node kind veya built-in variant union'ına kontrolsüz string ekleme yok.
- [ ] **R02 · Tanımla ve kullan.** System'de düzenlenen kompozisyon Project Assets'te eklenebilir olsun; örnekler tanımı izlesin, yalnız açılmış içerik/parametreleri değiştirsin. Project snapshot'ını tanıma dönüştürme ayrı açık işlem olsun; eski bağımsız kopyalar sessizce bağlanmasın.
- [ ] **R03 · Değişiklik, koparma ve teslimat.** Tanım güncellemesi, silinen/yeniden adlandırılan slotlar, korunacak instance verileri, döngü/nesting limitleri ve detach davranışını test et. Renderer/export/backup/import/Undo aynı tanımı çözsün. Gerekirse yeni sürümlü tanım formatı getir; mevcut strict parser'a belirsiz kayıtlar sıkıştırma.

**Kabul:** aynı tanım iki projede kullanılır; System'deki stil/kompozisyon düzenlemesi izin verilen şekilde ikisine ulaşır, her instance'ın başlık/metin değerleri korunur. Geçersiz yapısal değişiklik veri silmek yerine açıklanır/engellenir. Tanım ve instance'lar M2/M3 üzerinden bağımsız tüketicide ve temiz profilde korunur.

**Başlama kapısı:** M2/M3 sözleşmeleri ve gerçek görevlerden ihtiyaç doğrulaması. İlk iterasyon tek kompozisyon, az sayıda açık prop/slot ile sınırlı; sınırsız component builder aynı PR'a alınmaz.

### M6 — Kontrollü sistem sürümleri ve ihtiyaç odaklı kütüphane

- [ ] **V01 · Draft/release sözleşmesi.** Schema sürümünden ayrı immutable sistem release'i tanımla. Mevcut projelerin canlı sistem davranışı varsayılan olarak korunur; release'e sabitleme açık seçimdir. Export manifesti kullanılan snapshot/release'i belirtebilir.
- [ ] **V02 · Güncelleme önizlemesi.** Sabitlenmiş proje için token/recipe/component-definition farkı, örnek ekran etkisi, kabul ve geri dönüş akışı. Release değiştirmek instance içeriğini sessizce dönüştürmesin. Kırıcı slot/prop değişimleri için migration veya açık ret gerekir.
- [ ] **L01 · Kanıta göre yeni komponentler.** Ön adaylar Textarea, Select ve Radio; sonra gerçek görev gerektirirse Dialog, Tabs ve Tooltip. Sıra bir taahhüt değildir. Her komponent aynı API, state/tema, inspector, token consumer, contrast, source export ve test sözleşmesini tamamlamadan teslim sayılmaz.

**Kabul:** bir proje sabit sürümde kalırken diğeri canlı taslağı izler; güncelleme açık, geri alınabilir ve export'ta yeniden üretilebilir. Komponent sayısı artırmak mevcut token/çıktı doğruluğunun önüne geçmez.

## 5. İlk uygulama partisi ve çalışma sınırı

İlk partinin S01–S03 ve D01/D02 dilimleri uygulanmıştır; yeni kullanıcı kararıyla **C01–C03 CLI + statik registry** ana yol oldu. Sonraki kabul kapısı **C04 public 0.2.0 yayın hazırlığı/temiz kurulum**; npm 0.2.0 yayını artık doğrulandı; production registry deploy/retention ve temiz host kurulum kabulü açık. D03 seçili frame kaynak paketi bekletildi. M1 manuel kabul kapıları hâlâ açıktır. Gerçek kullanıcı kabulü ayrıca tamamlanmalıdır. İlk partinin referans sırası:

1. S01 için Card title / Input error / Button frame görev akışını ve kapsam-kaynak metadata sözleşmesini yaz.
2. Inspector'da kısa kapsam + isteğe bağlı kaynak/etki detayını uygula; canvas ve storage modelini yeniden tasarlama.
3. Gerçek değer, reset, no-op, Light/Dark ve doğru recipe/katman izolasyonu için regresyon ekle; manuel görev kontrolü yap.
4. Ardından S02/S03; bağımsız olarak D01'in dosya/manifest/kurulum sözleşmesini hazırla.
5. D02–D04 ve B01–B03 ile ilk taşınabilir, güvenle kullanılabilir teslimatı kapat. Yeni master-component modeli bu teslimatın önüne geçmesin.

M1–M3'te mevcut yedi komponent yeterli. Genel refactor, tüm Base UI kataloğunu ekleme veya yeniden canvas tasarlama bu partinin kapsamına dahil değil. Süre tahmini, ilk dilimin kapsamı ve ekip kapasitesi netleşince yapılır.

## 6. Karar kapıları — gerektiği yerde netleştir

| Karar | Önerilen varsayılan | Karar gereken iş |
| --- | --- | --- |
| İlk kullanıcı/görev | React developer/design engineer; form + basit dashboard | S01 görev kabulü ve P01 |
| Kod teslim şekli | Kullanıcı kararı: CLI + statik registry; ZIP manual fallback. CSS Modules + scoped theme, host davranışı geliştiriciye ait | [CLI sözleşmesi](cli-registry.md); C04 lisans/npm/production registry ve immutable release retention kapısı |
| Import çakışması | Yeni proje ve yeni sistem; mevcut sisteme bağlamak açık işlem | B01/B02 |
| Sistem silme | Bağlı proje/history/okunamayan referans varken engelle; cascade-delete yok | B03 |
| Kullanıcı komponenti | System-owned kompozisyon + sınırlı props/slotlar; eski saved asset bağımsız kalır | R01 |
| Sistem sürümüne bağlanma | Mevcut live davranış değişmez; pin opt-in | V01 |
| Çoklu-frame responsive export | Şimdilik yalnız seçili frame; otomatik ağaç birleştirme yok | Ayrı ihtiyaç/teknik karar |
| Backend ve dağıtım | Local-first/statik kalır; cloud, sağlayıcı, lisans, hizmet maliyeti ayrıca değerlendirilir | Ayrı onay; M1–M4'ü bloklamaz |

Bu öneriler uygulama yetkisi veya kesinleşmiş kullanıcı tercihi gibi sunulmaz. İlgili dilim başlamadan yalnız gerçekten belirsiz/riskli karar sorulur; onaylı Project/System ayrımı ve bağımsız frame sözleşmesi yeniden tartışmaya açılmaz.

## 7. Her dilimin kalite kapısı

- Var olan kayıtlar ve tarihi kesirli değerler korunur; parse/export/reset/history tutarlıdır; keyfi CSS/JS kabul edilmez.
- Focus göstergesi korunur. Keyboard alternatifleri, seçim/focus geri dönüşü, native input undo/composition ve no-op writes test edilir.
- System değişikliği yalnız doğru scope'u etkiler; Project kaynak çözümü her zaman bağlı systemId'den gelir.
- Render/TSX/CSS gerçek consumer'la karşılaştırılır. Test sonucu, SSR markup eşitliği ve screenshot yakalama tam görsel veya WCAG kabulü diye sunulmaz.
- [Erişilebilirlik checklist'i](accessibility-checklist.md) ve yeni System/Project görevleri birlikte değerlendirilir: VoiceOver, Safari/Chrome, native %200 zoom, forced-colors ve uzun metin. Manuel kabul ürünün sonuna ertelenmez.
- 180 Text örneği ve üç dolu Project frame'iyle interaction profili al; inspector ölçümleri kamera hareketi başına tüm board'u gereksiz ölçmesin, pointermove storage/parse çalıştırmasın. Ölçmeden 60fps iddiası yok.

### Son bilinen kanıt

**Manuel kabul hazırlığı · 2026-10-16:** `studio-acceptance.md` eklendi: gerçek Figma kullanıcısına yönlendirmeden verilecek altı System/Project/CLI görevi, scope doğrulaması, ayrı keyboard/VoiceOver/native zoom/mobile kontrolleri, environment/build kaydı ve blocker/major/minor triage. Erişilebilirlik checklist'i güncel System/Project kapsamına bağlandı; tarihi specimen kanıtı ayrı işaretlendi. Bu dokümantasyon çalışması gerçek kullanıcı/VoiceOver oturumu yerine geçmez; hiçbir manuel sonuç pass olarak işaretlenmedi.

**Workspace cleanup turu · 2026-10-15:** Başlangıçta eski 240s timeout birebir tekrarlanmadı; ölçüm Chrome ana prosesinin/CDP'nin ~32s'de kapanmasına rağmen stderr pipe'ının ~46s'ye kadar Node'u açık tuttuğunu gösterdi. Workspace artık Browser.close ister; POSIX'te yalnız kendisinin başlattığı izole Chrome grubuna bounded TERM/KILL uygular, ana proses çıkışını bekler ve detached helper'ın açık tutabileceği kendi stderr okuma ucunu kapatır. Kullanıcının diğer Chrome süreçleri/grupları sinyallenmez. Browser cleanup hata verse bile server/profil temizliği finally ile denenir. Beş proses regresyon testi (TERM-resistant child, detached inherited writer, launch failure, idempotence ve sahiplik sınırı) geçti. Düzeltme sonrası üç tam çalıştırmada 23/23 kontrol ve parent tarafından ayrı gözlenen exit/stdio close ~31s, exit=0 oldu; cleanup sonrası açık browser pipe'ı yok. Eksik Chrome executable hata yolu 158ms'de exit=1 + cleanup ile bitti. Lint/diff geçti; bu turda başlangıç production build alındı, uygulama/CLI runtime kodu değişmedi. Workspace process-exit alt kapısı bu kanıtla kapandı; manuel erişilebilirlik kabulü açık.

**Temiz consumer turu · 2026-10-15:** Yeni opt-in `check:cli:clean`, public 0.2.1 CLI + production registry ile repo dışındaki boş host/cache içinde npm install yaptı; Next olmadan React/Vite build/type-check/browser ve ardından Next 16.3.6 install/static build/prerender/hydration/browser geçti. Consumer node_modules'u symlink değil, kendi tsc/Next/Vite executable'ları kullanıldı; lifecycle scriptleri çalıştırılmadı, geçici host/cache temizlendi. Light/Dark, Card title/edge/corner kesirleri, Input error, native choice ve 390px reflow doğrulandı. Vite `use client` ignore uyarıları verdi; runtime hata yok. Refactor sonrası mevcut hızlı `check:cli` de geçti. Clean-install alt kapısı kapandı; C04/D04 manuel kabul, frame teslimat kapsamı ve workspace exit timeout'u açık.

**0.2.1 yayın/deploy doğrulaması · 2026-10-15:** Kullanıcı yayını ve deployment'ı tamamladı. Npm 0.2.1/MIT/latest ve incelenen tarball SHA-512 eşitliği, public npm exec version/help doğrulandı. Production index/release 200; ilk public release 210.376 byte ve tracked arşivle birebir aynı. Public npm 0.2.1 registry flag'siz init, yedi komponent/layout add ve idempotence geçti. Public CLI standalone React/Next build + browser consumer geçti; bu consumer yerel registry/kurulu node_modules kullanır. Develop/clipboard komutları 0.2.1'e güncellendi; bu son UI değişikliği yeni deploy ister. Farklı source release'ler arasında canlı retention henüz gözlemlenmedi (integration testi var). C04 clean dependency install, manuel kabul ve workspace exit timeout'u açık. Yayın-sonrası UI değişikliğinde lint, production build, TypeScript, diff kontrolü ve altı CLI/source browser senaryo grubu geçti.

**Retention / 0.2.1 patch turu · 2026-10-15:** İlk canlı release'in exact 210.376 byte snapshot'ı `registry/releases/` ve envantere alındı. Temiz build geçmiş release'leri latest index'ten önce kopyalar; snapshot hash/size/source/symlink kontrolü ve bozuk arşivde fail vardır. 26 CLI/arşiv testi, 582 app unit/SSR/source testi, standalone React/Next/browser consumer, gerçek npm 0.2.0 → yerel 0.2.1 clean-output/pin/local-edit/fractional-theme regresyonu geçti. Son production build, registry freshness, TypeScript ve lint geçti; `out` içindeki eski release arşivle byte-byte aynı. 0.2.1 production registry default'u, entry-relative import ve package-manager önerileri ekler; config/resolver değişmez. İncelenen tarball 25 dosya / 40.627 byte; local tarball npm exec version/help geçti. Yayın isteği EOTP ile durdu; 0.2.1 yayımlandı denmez, Develop 0.2.0'da kalır. Arşiv henüz commit/deploy edilmedi. Clean dependency install, manuel kabul ve önceki workspace process-exit timeout'u açık.

**Yayın sonrası doğrulama · 2026-10-15:** `bambiui@0.2.0` npm'de MIT ve latest olarak doğrulandı; SHA-512 incelenen tarball ile aynı. Public npm'den --version/--help ve gerçek init/add/theme + standalone React/Next build/hydration/browser geçti. Develop public npx komutlarına geçirildi. Registry geçici yerel host'tu ve React/Base UI node_modules'u yeniden kullanıldı; production deploy/retention ve clean install/manual kabul kapısı kapanmadı. 0.2.0 help'indeki eski preview cümlesi sonraki patch'te düzeltilecek; yayımlanmış CLI kaynakları bu turda değiştirilmedi.

**MIT/yayın turu · 2026-10-15:** Kullanıcı MIT'yi onayladı. CLI ve explicit ortak-source allowlist'i MIT, diğer Studio dosyaları private; standart LICENSE/NOTICE dağıtılır, kullanıcı verisi yeniden lisanslanmaz. Kaynak grafiği license-scope gate'i ve MIT registry doğrulaması eklendi. Npm hesabı package maintainer'ıyla eşleşti; 0.2.0 tarball'ı 24 dosya / 39.379 byte olarak incelendi. Publish denemesi EOTP/2FA ile durdu; başarılı yayın/deploy iddiası yok. OTP/token yalnız kullanıcının kendi npm akışında işlenir.

**Güncel CLI turu:** 581 unit/SSR/source + 16 CLI testi; actual npm pack/local offline npm exec; CLI-installed React/Next build + Chromium; production build, lint/TypeScript/catalog+registry freshness; 97 System ve altı CLI/source browser senaryo grubu geçti. Npm target 0.2.0 hazır fakat publish/deploy yapılmadı; temiz dependency install ve license/production registry retention kapısı açık. Project workspace bu turda yeniden çalıştırılmadı; önceki D02 kapanış timeout'u çözülmüş sayılmaz. Ayrıntı [CLI kanıt kaydı](cli-registry.md).

S03'ün son uygulama turunda 566 unit/SSR/source testi, 97 System ve 23 workspace smoke kontrolü, production build, lint, TypeScript ve diff kontrolü geçti. Workspace son çalıştırmaları temiz exit ile tamamlandı; S01'deki terminal kapanış timeout'u bu turda tekrarlanmadı. Desktop/mobil yardım screenshot'ları incelendi. Ayrı composer drag/source-consumer scriptleri bu turda yeniden çalıştırılmadı; onların önceki sonuçları yeni kanıt değildir. Manuel VoiceOver/native zoom/cross-browser kabulü hâlâ açık.

D01 dokümantasyon turundaki 11 hedefli source/bundle testi ve eski page-consumer sonucu tarihsel kanıttır. **En güncel D02 turunda** 581 unit/SSR/source testi, production build, TypeScript/lint/catalog freshness, 97 System smoke, yeni System consumer React/Next build + browser izolasyon ve dört source-download browser senaryo grubu temiz exit ile geçti. Son workspace çalıştırması 23 senaryo/cleanup başarısını logladı ama terminal kapanışında 240 saniyelik timeout aldı; temiz workspace exit kabulü açık. System consumer kurulu bağımlılıkları kullanır; D04 fresh install/full parity değildir. Mobil download screenshot'ı incelendi. D03, public lisans ve manuel kabul kapıları açık.

Temel doğrulama komutları:

```sh
node --test app/studio/*.test.mjs app/studio/composer/*.test.mjs app/studio/page-document/*.test.mjs app/examples/page-editor/*.test.mjs
npm run lint
npx tsc --noEmit --incremental false
npm run build
node scripts/studio-smoke.mjs
npm run test:browser-process
node scripts/studio-workspace-smoke.mjs
node scripts/studio-composer-smoke.mjs
node scripts/check-page-source.mjs --browser
node scripts/generate-source-catalog.mjs --check
node scripts/generate-registry.mjs --check
npm run test:cli
npm run check:cli
npm run check:registry
node scripts/check-system-source.mjs --browser
node scripts/studio-source-smoke.mjs --screenshots
git --no-pager diff --check
```

Node 22.15+ gerekir. Browser kontrolleri taze `out/` ister. Kaynak fixture oluşturan unit/consumer testlerini ana production build ile aynı anda çalıştırma; geçici dosyalar `.next` altında olabilir. Kullanıcı görevi ve kabul kriteri geçmeden yalnız test sayısına bakıp bir işi kapatma.

## 8. Şimdilik yapmayacaklarımız

Backend/auth, hesap zorunluluğu, Supabase entegrasyonu, AI/MCP, realtime collaboration/CRDT, yorumlar, sayfa hosting/publishing, billing, tasarım plugin ekosistemi, vektör çizim ve kapsamlı prototip animasyonları. Bunlar teknik olarak yasak değil; mevcut developer teslimat döngüsünü tamamlamadan öncelik değiller. Sağlayıcı, ücretlendirme veya open-source lisansı bu planla seçilmiş sayılmaz.
