# bambiui · Studio canvas composer uygulama planı

Tarih: 2026-10-03
Durum: **uygulama talimatı; aşağıdaki görevler henüz tamamlanmadı.**

Ürün kapsamının kanonik özeti [roadmap.md](roadmap.md), teknik geçmiş [interface-composer-plan.md](interface-composer-plan.md). Bu dosya üçüncü bir ürün roadmap'i değil; onaylanan Studio/Figma benzeri yönün düşük bağlam maliyetli görev defteridir. Çelişkide son açık kullanıcı kararı esas alınır, ilgili belgeler birlikte düzeltilir.

## 1. Amaç ve başarı tanımı

Kullanıcı mevcut Studio'dan ayrılmadan:

1. Sol menüde **Components** altında mevcut yedi komponenti görür.
2. Aynı panelde hemen altındaki **Pages +** ile sayfa oluşturur.
3. Sayfanın canvas'ına Web, Tablet, Mobile frame'leri ekler.
4. Komponent, Stack ve Grid'i doğrudan frame'e sürükleyerek tasarım kurar.
5. Canvas'ta öğe seçer, taşır, sıralar; sağ inspector'dan instance/layout özelliklerini değiştirir.
6. Frame'leri bağımsız düzenler. Mobilde web'dekinden farklı içerik, komponent ve sıra olabilir.
7. Kaydı yenilemeden sonra geri açar, Undo/Redo ve taşınabilir yedek kullanır.

**Başarı yalnız unit test değildir:** boş sayfadan iki farklı cihaz tasarımı, canvas üzerinde sürükle-bırakla kurulabilmelidir. Kullanıcı ağaca node ekleyen bir form editöründe çalışıyor hissetmemelidir.

### Yapılmayacaklar

- `/examples/page-editor` ekranını ürün arayüzü olarak büyütmek.
- Sadece Layers listesine drag/drop ekleyip canvas composer tamamlandı demek.
- Üç genişlikte aynı DOM'u gösterip bağımsız frame düzenleme teslim edildi demek.
- Figma'nın vektör araçlarını, plugin ekosistemini veya tüm serbest koordinat modelini kopyalamak.
- Bu iş içinde backend, auth, MCP, AI, ücretlendirme, realtime işbirliği yapmak.
- Mevcut token modelini veya komponent stilini gereksiz yere yeniden yazmak.

## 2. Onaylananlar ve açık kararlar

### Kullanıcının açıkça belirlediği kapsam

- Ana ürün mevcut Studio; ikinci bir uygulama/demo değil.
- Components altında Pages; çoklu sayfa ilk teslimatın parçası.
- Doğrudan canvas odaklı sürükle-bırak temel kullanım şekli.
- Web/tablet/mobil frame içerikleri bağımsız; zorunlu ortak içerik ağacı yok.
- Ortak design system ve komponent kütüphanesi kullanılacak.
- Context Menu gerekli olduğunda UX'i destekleyebilir; zorunlu bir ilk adım değil.

### Uygulama önerileri — kullanıcı kararı diye sunma

| Konu | Önerilen başlangıç | Ne zaman karar gerekir? |
| --- | --- | --- |
| Yeni sayfa | Boş canvas + Add frame; üç frame zorla oluşturulmasın | C04 öncesi UI varsayımı olarak belirt; kolay değişebilir tut |
| Frame presetleri | Web 1440×900, Tablet 768×1024, Mobile 390×844; ölçüler düzenlenebilir | C04; bunlar cihaz sertifikası veya runtime breakpoint değildir |
| Sistem bağlantısı | Koleksiyon `systemId` ile mevcut `StoredSystem.id`'ye bağlı; aktif sistemin tokenlarını canlı tüketir | C00'da K4 kapsamını netleştir |
| Sistem silme | Bağlı sayfa varsa silmeyi engelle; sayfa kaydını cascade-delete etme | K4 için kullanıcı onayı; ilk entegrasyon öncesi |
| Aynı ID'ye sistem import | Mevcut sistemin güncellemesi gibi tüm bağlı frame'leri etkiler; uyarı açık olmalı | K4; mevcut import akışı incelenmeli |
| Kayıt | Doğrulanmış atomik düzenleme sonrası otomatik yerel kayıt; açık JSON yedeği ve hata durumu | C02/C03; demo'nun explicit-save davranışını sessizce kopyalama |
| Kod teslimatı | Önce seçili frame için mevcut kaynak + CSS/theme çıktısı | K2 onayı, C11 |
| Responsive runtime | Bağımsız frame'lerin ekran aralıklarına açık eşlenmesi; otomatik ağaç birleştirme yok | Ayrı karar/görev; ilk canvas dilimini engellemez |

K1–K5 tümü bu planla onaylanmış sayılmaz. Özellikle K3 reusable kullanıcı komponentleri ilk canvas kapsamına eklenmez. Gerçekten gerekli onayı ilgili göreve geldiğinde **tek, kısa soruyla** al; bütün projeyi tekrar tartışmaya açma.

## 3. Mevcut kod haritası ve tuzaklar

| Mevcut dosya | Görevi / dikkat |
| --- | --- |
| `app/studio/studio.tsx` | Sistem seçimi/kaydı, token history, route ayrıştırma, sidebar, specimen/Develop ve inspector aynı dosyada. Composer iş mantığını buraya yığma. |
| `app/studio/systems.ts` | `SystemCollection`, `StoredSystem.id`, `activeId`; sistem kaydı `bambiui.systems.v1`, eski token anahtarı mirror. Sayfaları token JSON'una ekleme. |
| `app/(workspace)/layout.tsx` | `<Studio />` ve route children render eder. Yeni route içinde ikinci Studio kurma. |
| `app/(workspace)/[component]/page.tsx` | `dynamicParams=false`; statik component rotaları. Kullanıcı sayfa ID'sini buraya component gibi ekleme. |
| `app/studio/preview.tsx`, `preview.module.css` | Mevcut specimen pan/zoom ve seçim. Davranışlarını incele, komple kopyalama veya specimen'i page renderer'a dönüştürme. |
| `app/globals.css` | Ortak Studio shell ve nötr editor renkleri. Yeni CSS mümkün olduğunca composer modülünde. |
| `app/studio/controls.tsx`, `icons.tsx`, `studio-copy.ts` | Ortak editor kontrolleri, ikonlar ve İngilizce UI metinleri. |
| `app/studio/page-document/model.ts`, `registry.ts` | Tek-root v1 belge; 100 node/12 derinlik sınırı, slot/prop kuralları. Registry yalnız Button/Input/Switch/Card/Text destekliyor. |
| `app/studio/page-document/commands.ts`, `history.ts` | Atomik insert/delete/move/update/rename, bounded snapshot history. `move.index` çıkarma sonrasındaki indekstir. |
| `app/studio/page-document/render.tsx`, `export.ts` | Gerçek komponent render ve deterministik TSX. `RenderPageBundle` bir `<main>` üretir; çoklu frame içinde bunu tekrar tekrar kullanma. Frame scope + `RenderPage` tercih et. |
| `app/studio/page-document/bundle.ts` | Tek-page snapshot bundle v1, 1 MiB UTF-8 import sınırı. Çoklu-frame formatı değildir. |
| `app/studio/layout/` | Container/Stack/Grid; spacing değişkenleri. Grid'in sabit 32rem container eşiği ve Container maxWidth/padding'i frame geometrisi değildir. |
| `app/examples/page-editor/` | Teknik fixture: seçme/komut/kayıt/hata güvenliği örnekleri. Yeni üretim kodu buradan import etmesin; gerekli saf helper'ı ortak modüle taşı ve fixture importunu güncelle. |
| `scripts/page-editor-smoke.mjs` | Eski fixture için Chrome/CDP test altyapısı; Studio kabul testi değildir. |
| `scripts/page-source-files.mjs`, `check-page-source.mjs`, `page-source-browser.mjs` | Kopyalanan kaynak tüketici testleri; yeni registry/layout değişirse uyarlanmalı. |

**Önemli engeller:** Root Container şu an Button/Input gibi her kind'ı doğrudan kabul etmiyor; Grid yalnız Grid.Item kabul ediyor. Boş frame'e Button ve boş Grid'e Card bırakma UX'i bilinçli adapter gerektirir. Mevcut Container genişlik/padding'i gerçek frame kenarıyla karıştırılırsa öğe yanlış yerde görünür.

## 4. Hedef kullanıcı akışı ve ekran sorumlulukları

### Sol panel

- Mevcut Foundations kalır; Components listesi altında Pages yer alır.
- Component satırına tıklama mevcut global komponent düzenlemeye gider. Page açıkken ayrı tutamaç/Insert alanıyla sürüklemek navigation başlatmaz.
- Pages: ekle, seç, yeniden adlandır; sil/çoğalt görünür menüde ve uygun context menu'de.
- Seçili sayfanın Frames/Layers ağacı aynı panelde alt bölüm olabilir; ilk dilimde karmaşık tab sistemi ekleme.
- Palette: yedi komponent + layout araçları (Stack, Grid; Container/Form ihtiyaç ve slot kurallarıyla). Compound slot'ları kullanıcıya ham teknik node listesi olarak dayatma.

### Orta alan

- Tek canvas, frame'ler birlikte görünür; Web/Tablet/Mobile bir segmented preview değişimi değildir.
- Frame başlığından taşı; içeriğine tıklayınca ilgili instance seçilir. Canvas boşluğuna tık seçim temizler.
- Space+drag veya orta tuş pan; pointer etrafında zoom; Fit page ve Fit selection.
- Component/layout palette → frame insertion ana yol. Ghost preview, parent highlight ve insertion çizgisi bırakmadan önce görünür.
- Design modunda butona basmak submit değil seçim/taşıma yapar. Ayrı Preview/Interact modu gerçek komponent davranışını denemeye açar; demo form veri göndermez.
- Escape geçici etkileşimi iptal eder; pointercancel ve pencere blur temizlenir.

### Sağ inspector

- Hiç seçim yok: sayfa bilgisi ve frame ekleme; global token alanları gösterilmez.
- Frame seçili: ad, preset/custom ölçü, konum ve varsa clipping/overflow kapsamı açık alanlar.
- Layout seçili: direction, align, justify, gap, kolon/span gibi gerçekten tüketilen özellikler.
- Komponent seçili: desteklenen variant/size/tone/radius/states/text gibi JSON-safe instance prop'ları.
- Geçerli değişiklikler küçük kontrollerle uygulanır; typing draft ve geçersiz ara değer belgeye yazılmaz. Büyük bir Apply-form ana etkileşim olmamalı.
- Global token düzenlemeye geçiş açık link/eylem; instance prop değişikliği `DesignSystem` kaydına yazılmaz.

### Context Menu

`@base-ui/react/context-menu` ve gerekiyorsa aynı eylemleri paylaşan `@base-ui/react/menu` kullan. Sağ tıklanan öğe hedef olur; eski seçili öğe yanlışlıkla silinmez. Portal nötr Studio renkleriyle görünür, frame zoom'undan etkilenmez. İlk eylemler: Duplicate, Delete, Select parent, uygun Insert/Wrap eylemleri. Boş canvas menüsü Add frame sunabilir. Menünün görünür `…` ve klavye karşılıkları şarttır.

## 5. Veri ve state sözleşmesi

Aşağıdaki isimler **önerilen yeni sözleşme**; mevcut dosya/API diye varsayılmamalı. C00'da sonlandır.

```ts
// DesignSystem.version:3 ve eski PageDocument.version:1 değişmez.
type ComposerDocument = {
  version: 1;
  id: string;
  systemId: string;
  pages: ComposerPage[];
};
type ComposerPage = {
  id: string;
  name: string;
  frames: ComposerFrame[];
};
type ComposerFrame = {
  id: string;
  name: string;
  preset: "web" | "tablet" | "mobile" | "custom";
  x: number;
  y: number;
  width: number;
  height: number;
  root: PageNode;
};
```

- Frame label/preset düzenlenebilir başlangıç bilgisidir; width/height gerçek kaynak. Ölçü değişince preset/custom tutarlılığı deterministik tanımlanır.
- Node ID'leri en az frame içinde tekil; editor selection `{pageId, frameId, nodeId}` ile adreslenir. DOM element ID'leri ayrıca instance/frame scope'lanır. `data-page-node` tek başına bütün canvas'ta tekil sanılmaz.
- Duplicate frame/page yeni frame/page/node ID'leri üretir; kendi iç referansları birlikte günceller. Shared component tanım ID'leri kopyalanmaz. Gizli cross-frame node bağlantısı kurulmaz.
- Mevcut tek-frame motoruna adapter: frame root'u geçici `PageDocument` olarak doğrula/düzenle; koleksiyon içinde ikinci document ID/name kopyası tutma.
- Parser exact-key allowlist, finite sayı, pozitif ölçü, benzersiz ID ve sınırlı uzunluk kullanır. Başlangıç limit önerileri: sistem başına 20 sayfa, sayfa başına 10 frame, belge toplamı 2000 node, frame başına mevcut 100 node/12 derinlik. Bunları ayrı sabitler ve boundary testlerle doğrula; ürün limiti diye gizleme.
- Çoklu belge JSON import byte kotasını ayrı tanımla (öneri 5 MiB); tek-page importer'ın mevcut 1 MiB sınırını gevşetme. Büyük image/base64 bu sürümde yok.
- Eski demo storage okunup silinmez. Eski bundle import'u açık kullanıcı eylemiyle bir yeni page/frame'e dönüştürülebilir; tema uyuşmazlığı sessizce aktif sistemi değiştirmez.

### Kalıcı veri / geçici state ayrımı

| Kalıcı belge | Oturum/editor state |
| --- | --- |
| Sayfalar, frame ölçü/konum, node ağacı, instance props, systemId | Kamera, hover, selection, drag session, context menu, inspector draft, Preview modu |
| Açık yedekte sistem snapshot'ı | Undo/Redo varsayılan olarak oturumluk; yedeğe eklenmez |

Page/frame işlemleri ve node işlemleri **tek composer history** üzerinden yürür. Frame bazlı motorun history'sini iç içe çalıştırma. Token geçmişi ayrı kalır. Aktif editöre göre Undo/Redo hedefi ve accessible label değişir; input'un native undo'su engellenmez. Sistem değişimi history'nin yanlış belgeye uygulanmasını engeller.

### Kayıt ve sistem ömrü

- Composer için ayrı sürümlü storage anahtarı/namespace. Aktif sistem ID'siyle yükleme tamamlanmadan yazma yok.
- Storage okumada parse/migration başarısızsa ham veri korunur ve autosave bloke edilir; explicit recovery gerekir.
- Kayıt önce doğrulanır. Kota/erişim hatasında state kalır, “Saved” gösterilmez; yedek ve retry sağlanır.
- Save-time değişim kontrolü diğer sekmenin kaydının üzerine sessiz yazmayı engeller; atomik kilit veya sync olduğu iddia edilmez.
- Sistem switch sırasında pending kayıt ya tamamlanır ya görünür hata ile korunur; yeni sistemin namespace'ine eski belge yazılmaz.
- `systemId` aynı kalırsa isim değiştirme sayfaları koparmaz. ID değişirse rebind açık işlem olmalı.
- Sistem silme/replace/duplicate için K4 kararı uygulanır; sayfaları sessizce taşıma/silme. Orphan veriyi saklamak silmekten güvenlidir.

## 6. Render, layout ve koordinatlar

- Canvas frame konumu/zoom editor verisidir; React sayfa çıktısına `position:absolute; left:canvasX` olarak sızmaz.
- Frame içi varsayılan düzen Stack/Grid; içerik içinde sınırsız x/y modeli bu ilk işin kapsamı değildir.
- Frame root kendi genişliğini doldurmalı. Bugünkü Container narrow/wide kısıtını tüm tasarıma zorlamamak için ayrı frame root ya da geriye uyumlu full-width seçenek tasarla. Varsayılanları değiştirme.
- Web frame küçük editör alanında da 1440 CSS px kalır; canvas kamera ölçekler. `max-width:100%` ile mobile daralırsa yanlış preview olur.
- Bir frame viewport değildir. Container query kullanan layout çalışır; media query tüketicileri için iframe/izole viewport gereksinimi ayrı karardır. Gerçek viewport testi iddiası yapılmaz.
- İçerik yüksekliği frame'i aşınca ilk politika açık olmalı: design modunda overflow/hint görünür, hedef görünmez biçimde kaybolmaz. Fixed height/clipping davranışı Preview ve export'ta aynı tanımlanır.
- Her frame aynı aktif system/theme CSS değişkenleriyle scope'lanır. Çoklu `<main>`, tekrarlanan input ID ve label association hatalarından kaçın.
- Google font yükleme mevcut Studio yolundan beslenir; her frame ayrı stylesheet yüklemez.

### Tek drag motoru

Kaynak: palette kind veya `{frameId,nodeId}`. Hedef: `{frameId,parentId,index}` ve gerektiğinde atomik wrapper komutları.

1. Drag threshold aşılana kadar tıklama seçimdir; pan/resize ile aynı anda başlamaz.
2. Pointer → canvas koordinatı kamera inverse transform ile hesaplanır; scroll ve zoom hesaba katılır.
3. Hover hedefi DOM/hit-test geometrisinden gelir; en yakın **geçerli** slot seçilir, görünmez ancestor fallback yapılmaz.
4. Stack row/column yönüne göre önce/sonra çizgisi; Grid hücre/slot hedefi gösterilir.
5. Empty frame'e Button bırakmada gerekiyorsa Stack; boş Grid'e Card bırakmada Grid.Item oluşturma tek batch olur. Ghost sonucu gösterir, rastgele wrapper eklenmez.
6. Drop authoritative parser/command doğrulamasından geçer; başarı tek history adımı, başarısızlık sıfır değişiklik.
7. Cross-frame move iki frame'i atomik doğrular; kaynak silindi ama hedef insert başarısız gibi yarım sonuç yok. İlk drag diliminde kapalı olabilir, UI bunu açık gösterir.
8. Her pointermove'da tüm belge serialize/validate edilmez. Geometri drag başlangıcı ve layout değişimlerinde ölçülür; hover/ghost en fazla animation-frame ritminde güncellenir.
9. Drag boyunca localStorage yazılmaz; drop commit'inde kayıt. Scroll/pan sonrası hedef geometrisi yenilenir.

Native HTML drag mevcut fixture'da vardır; otomatik üretim tercihi değildir. Palette→zoomlu canvas, touch/pen ve klavye için önce dependency envanteri yap. Mevcut uygun kütüphane varsa kullan; yoksa küçük teknik karşılaştırmayla pointer tabanlı çözüm veya tek DnD bağımlılığı seç. İki farklı drag motoru aynı gesture'ı dinlemesin.

## 7. Dosya sınırları ve entegrasyon önerisi

**Önerilen yeni dizin:** `app/studio/composer/`. Dosyalar ihtiyaç oldukça oluşturulur; boş scaffold ağacı üretme.

- `model.ts`, `model.test.mjs`: çoklu page/frame parser, adapter, limitler.
- `commands.ts`, `history.ts`, testleri: page/frame + node atomik işlemleri.
- `storage.ts`, testleri: güvenli local kayıt/import/backup.
- `use-composer.ts`: state/history/persistence orchestration; UI dışında saf işleri burada yığma.
- `pages-panel.tsx`, `layers-panel.tsx`, `insert-panel.tsx`.
- `composer-canvas.tsx`, `frame.tsx`, `selection-overlay.tsx`.
- `camera.ts`, `drop-target.ts`, saf geometri testleri; `use-canvas-gesture.ts` gerekirse.
- `inspector.tsx`, `context-actions.tsx`, `composer.module.css`.
- `scripts/studio-composer-smoke.mjs`: gerçek Studio uçtan uca kontrolü.

`studio.tsx` yalnız aktif workspace, system/theme ve editor bridge bağlar. Tüm composer'ı mevcut 1000+ satırlı dosyaya ekleme. Önce minimal seam oluştur; büyük refactor ile token davranışlarını aynı anda değiştirme.

### Static routing önerisi

Statik `app/(workspace)/pages/page.tsx` marker route + client-side page/frame selection kullan. İsteğe bağlı `#page=...&frame=...` hash deep link; hash parser saf testli, back/forward ve eksik ID fallback belirli olmalı. Kullanıcı ID'sine göre build-time route üretilmez. `/pages` route'u token selection fallback'ına düşüp Colors gösteremez. `useSearchParams` seçilirse installed Next rehberi/Suspense/static-export gereksinimleri ayrıca uygulanır; sırf route için SSR'a geçilmez.

Design/Develop davranışı açık olsun: Page açıkken Develop'a geçiş ilgisiz Button dokümanına sessizce atlamaz. Frame source paneli henüz yoksa açıklamalı disabled durum veya açık component-reference bağlantısı; karar C03'te kaydedilir. Component nav geri dönüşünde mevcut specimen ve token inspector aynen çalışır.

## 8. Küçük görevler — sırayla yürüt

Her görev sonunda status'u `[ ]` → `[x]` yalnız kabul kanıtı varsa değiştir. Yarı bitmiş görev `[~]`; engeli yaz. Bir turda bir görev; bağımsız saf testler dışında paralel UI editörü çalıştırma.

### [ ] C00 — Sözleşme ve karar kapısı

**Oku:** bu dosya §§1–7, `systems.ts`, `studio.tsx` sistem activate/import/delete kısımları, model/registry.

**Yap:** K4 için kısa onay al; preset/yeni sayfa/save varsayımlarını belirt. Çoklu frame/root/route/history scope kararını tek karar kaydında netleştir. DnD kararı C07'ye bırakılabilir.

**Kabul:** sistem silme/import/switch davranışı ve frame export sınırı belli; “bağımsız frame” ortak ağaca dönüşmemiş. Kod değişimi şart değil.

### [ ] C01 — Çoklu sayfa/frame saf modeli

**Yazma alanı:** yeni composer model ve testleri; gerektiğinde page-document adapter testleri.

**Yap:** parse/create page/create frame, ID üretimi caller'dan, bağımsız kökler, sınırlar. Token şeması ve eski v1 parser davranışı korunur.

**Kabul:** page/frame CRUD model fixture'ı, bağımsızlık, duplicate ID, unknown key, NaN/Infinity/negatif ölçü, limit eşikleri, no mutation, eski belge adapter round-trip testleri geçer.

### [ ] C02 — Komut/history ve güvenli storage

**Yazma alanı:** composer commands/history/storage + testler.

**Yap:** create/rename/delete/duplicate page/frame, move/resize frame, node command adapter; document başına history. Kayıt namespace/systemId/revision kontrolü. Silmede undo ve seçim fallback politikası.

**Kabul:** atomik fail/no-op/redo, bounded history, duplicate subtree ID remap; quota/corrupt/cross-tab/hydration guard testleri. Token undo geçmişi etkilenmez. Yeni document byte sınırı açık.

### [ ] C03 — Studio Components → Pages entegrasyonu

**Yazma alanı:** `studio.tsx` küçük bridge, marker route, pages panel/controller/CSS/copy.

**Yap:** Components altına Pages +; boş sayfa oluştur/seç/yeniden adlandır. Gerçek canvas alanında boş state; demo linki değil. Ayrı token/page inspector ve Undo hedefi. Sistem switch ve safe reload.

**Kabul:** aynı Studio shell içinde 2 sayfa oluşturulur, seçim ve refresh çalışır; component navigation geri dönüşünde token editor bozulmaz; `/pages` static build'de açılır. Bozuk kayıt üstüne yazılmaz. Bu görevde frame zorunlu değil.

### [ ] C04 — Bağımsız frame'ler ve canvas kamera

**Yazma alanı:** frame/canvas/camera ve inspector frame alanları; model komutlarıyla entegrasyon.

**Yap:** Web/Tablet/Mobile/custom frame ekle, yeniden adlandır/çoğalt; başlıktan taşı, ölçü alanlarından değiştir; gerçek genişlikli canvas'ta pan/zoom/Fit. İlk frame hit-test ve seçimi.

**Kabul:** üç frame birlikte görünür, ölçüler CSS px olarak doğru; zoom geometriyi export verisine yazmaz; frame taşıma tek undo; light/dark tokenları tüm frame'lere aynı sistemden gelir. Blank frame drop alanı vardır. Dar editör geniş frame'i daraltmaz.

### [ ] C05 — Yedi komponent ve frame/layout sözleşmesi

**Yazma alanı:** page-document registry/model/render/export + testler; layout yalnız gerekiyorsa.

**Yap:** Checkbox/Badge ekle; mevcut yedinin güvenli ve tasarım için gerekli props'larını component API'yle eşle. Root full-width çözümü, empty frame insert, Grid.Item/Card slot defaultları. Callback/raw ReactNode/icon JSX JSON'a girmez; ikon gerekiyorsa allowlist ID.

**Kabul:** yedi komponentin palette node fabrikası geçerli ağaç üretir; radius/variant/size/tone consumer ile aynı; her yeni prop renderer/export parity ve üretilen TSX testinde. Yeni token eklenirse proje kurallarındaki tüm consumer/reset/import/export/audit işleri yapılır; sırf composer için gereksiz token yaratılmaz.

### [ ] C06 — Canvas selection, hover, instance inspector

**Yazma alanı:** selection overlay/layers/inspector ve saf selection helper'ları.

**Yap:** frame/node click, hover outline/label, Escape, Select parent; sağ panel kompakt gerçek props. Boş alanın seçimi ve ancestor path. Design/Preview etkileşim ayrımı. Native input draft/undo korunur.

**Kabul:** outline layout shift yapmaz; zoom/pan sonrası node ile hizalıdır; mobil frame'de metin değiştirmek web'i değiştirmez; instance prop değişimi global token kaydını değiştirmez. Global sistem renk değişikliği frame'lere yansır.

### [ ] C07 — Palette → canvas gerçek insertion

**Yazma alanı:** insert panel, gesture/drop-target/overlay, ortak command adapter, testler.

**Yap:** DnD yaklaşımını seç ve kısa gerekçe yaz. Önce component/Stack/Grid'i palette'den frame içine bırak. Empty frame/Grid/Card slot adapter'ları ve açık insertion ghost/çizgisi. Visible Insert + klavye alternatifi.

**Kabul:** boş frame'e Button ve Grid içine Card sürüklenir; oluşan wrapper sonucu görünürdür. Geçersiz/yabancı payload kabul edilmez; cancel sıfır değişiklik; zoom 50/100/150'de drop doğru. Her ekleme tek undo/kayıt. Sadece layer drag testi kabul değildir.

### [ ] C08 — Canvas içi reorder/reparent ve cross-frame

**Yazma alanı:** mevcut tek drag motoru ve atomik command adapter/testler.

**Yap:** seçili instance'ı canvas'ta sürükle; Stack row/column önce/sonra, Grid slot ve farklı container hedefleri. Ardından bağımsız frame'e atomik move; varsayılan taşımadır, kopyalama ayrı açık eylem.

**Kabul:** pan/drag çakışmaz; self/descendant/nested-form/tekil-slot ihlalleri engellenir; cross-frame hata kaynaktan öğe silmez; source/target undo tek adım. Kopyalama yeni IDs verir. Pointercancel/Escape ve autoscroll hedef düzeltmesi testli.

### [ ] C09 — Context actions, duplicate, wrap ve kısayollar

**Yazma alanı:** context-actions + aynı komutları çağıran toolbar/menu; gerekiyorsa yeni wrap saf komutları.

**Yap:** verilen Base UI Context Menu API'si; görünür `…` eşleniği. Delete/Duplicate/Select parent; valid wrap Stack/Grid. Ctrl/Cmd+Z/Shift+Z ve Delete yalnız editor odağında, metin inputlarında native davranış.

**Kabul:** sağ tık hedefi doğru, disabled eylemler açık; klavye menü/Escape/focus restoration; transform dışı portal; wrap geçersiz slotu bozmaz. Context menu tek erişim yolu değildir. Tam çoklu seçim bu göreve otomatik eklenmez.

### [ ] C10 — Kalıcılık, import ve sistem yaşam döngüsü uçtan uca

**Yazma alanı:** storage/controller/system bridge ve Studio smoke; C02'yi yeniden yazma.

**Yap:** otomatik kayıt durumu, recovery/retry, portable composer backup + system snapshot, eski page bundle açık import. Sistem silme/replace/duplicate için onaylı K4. İki sekme ve switch sırasında bekleyen kayıt testleri.

**Kabul:** refresh tüm page/frame/node düzenini getirir; history politikasına uygun başlangıç; invalid import mevcut belgeyi korur; sistem uyuşmazlığı kullanıcıya sorulur; kayıt hatasında canvas düzeni kaybolmaz. Tarayıcı storage'ın kalıcı yedek olmadığı açık.

### [ ] C11 — Develop ve seçili frame kaynak çıktısı

**Ön koşul:** K2 teslimat kararı; bağımsız frame runtime mapping gerekmez.

**Yap:** seçili frame için mevcut source exporter adapter; adı/importları güvenli üret. Develop görünümünü page/frame kapsamına hizala. Canvas metadata ve editor overlay CSS çıktıya sızmaz. JSON backup ile source delivery farklı eylemler.

**Kabul:** seçili frame aynı sistem/theme ile tüketici React/Next fixture'da derlenir; kaynak/stil/tema birlikte çalışır; iki ayrı frame çıktısı bağımsızdır. Responsive tek route otomatik üretildi iddiası yok. Sıfırdan install yapılmadıysa açıkça belirt.

### [ ] C12 — UX, performans ve erişilebilirlik kabulü

**Yap:** gerçek görev videosu/screenshot incelemesi ve manuel klavye, VoiceOver, native %200 zoom, forced-colors; 3 dolu frame ile interaction profiling.

**Kabul senaryosu:** kullanıcı Studio'da sayfa oluşturur → Web/Mobile ekler → Stack/Grid + yedi komponentten uygunlarını sürükler → mobile farklı bir alan ekler → canvas'ta taşır → undo/redo → token değiştirir → kaydeder/refresh → backup round-trip → seçili frame kodunu tüketir. Her adım görünür UI üzerinden.

Performans: pointermove sırasında storage/JSON parser çalışmaz; gereksiz bütün canvas rerender'ları profile edilir. 60fps/WCAG uyumu ölçmeden iddia edilmez. Reduced-motion'a uy; seçim/focus animasyonu hit-test'i geciktirmesin.

## 9. Test ve doğrulama matrisi

| Katman | Zorunlu kanıt |
| --- | --- |
| Saf model | valid/invalid, strict keys, limits, immutability, bağımsız frame, ID remap |
| Commands/history | atomic batch, source/destination, cancel/no-op, redo branch, geometry grouping |
| Storage | hydration no-write, corrupt preserved, quota, conflict, switch, backup/import |
| Registry/render/export | yedi komponent, slot/props, SSR parity, TSX derleme, gerçek stil tüketimi |
| Koordinatlar | pan offset, scroll, zoom inverse, insertion index, row/column, empty targets |
| Studio browser | sidebar→page→frame→palette drop→canvas move→inspector→reload; token regression |
| Manuel | görsel tutarlılık, keyboard/task flow, VoiceOver, native zoom, forced-colors, touch |

Mevcut komutlar (doğrulanan repo düzeni):

```sh
node --experimental-strip-types --test app/studio/*.test.mjs app/studio/page-document/*.test.mjs app/examples/page-editor/*.test.mjs
npx tsc --noEmit --incremental false
npm run lint
npm run build
node scripts/page-editor-smoke.mjs
node scripts/studio-smoke.mjs
node --experimental-strip-types scripts/check-page-source.mjs --browser
```

Composer testleri oluşturulunca `app/studio/composer/*.test.mjs` full suite'e eklenir; dosya yokken glob ile test çalıştırma. Yeni Studio browser testi oluşturulunca build sonrası `node scripts/studio-composer-smoke.mjs` eklenir. Browser server/process'leri süre sınırlı ve cleanup'lı çalışmalı. Node 22.15+ gerekir. Başlangıçtaki 188 test/15 demo smoke grubu **eski fixture kanıtıdır**, Studio composer kabulü değildir.

## 10. Düşük token kullanan model için çalışma protokolü

1. Her oturumda bütün geçmişi okuma. `AGENTS.md`, bu dosyadaki ilgili görev ve son devir notu yeterli başlangıçtır.
2. Önce `git status --short`: kullanıcı değişikliklerini koru; reset/stage/commit yapma.
3. Dosya yolunu bul, yalnız ilgili bölümünü oku. `studio.tsx` tamamını her tur context'e alma.
4. Next kodundan önce installed `node_modules/next/dist/docs/` ilgili rehberi oku; Base UI için `docs/base-ui.md`; komponent değişikliğinde `docs/component-api.md`.
5. Bir görev/tek yazma kapsamı. Model bir turda tüm composer'ı üretmeye çalışmasın; aynı UI dosyasını iki ajana verme.
6. Önce saf helper testleri; ardından tsc/lint, davranış değiştiyse ilgili browser testi. Full build milestone'da ve route/SSR değişince.
7. Hata varsa gerçek sebebi daralt; timeout artırıp testi geçmiş sayma. Sadece TypeScript susturmak için `any`/cast yığma.
8. Kullanıcıya 5–8 satır: değişen akış, dosyalar, geçen/çalıştırılmayan test, eksik ve sıradaki görev. Eski tüm işleri tekrar anlatma.
9. Görev bittiğinde aşağıdaki devir defterini güncelle. Eski sayıları yeni test sayısı gibi sunma.
10. Erişilebilirlik ve güvenliği tasarruf için atlama; token tasarrufu hedefli okuma ve küçük görevlerle sağlanır.

### Sonraki modele verilecek kısa başlangıç mesajı

> `docs/studio-composer-execution-plan.md` içindeki ilk tamamlanmamış görevi uygula. Önce durum/devir notunu ve o görevin bağımlılıklarını oku. Hedef ayrı demo değil mevcut Studio'da Components altındaki Pages ve bağımsız frame'lerle canvas-first Figma benzeri akış. Kullanıcı dosyalarını koru; bu görevin dışına çıkma. Karar kapısı varsa yalnız ilgili kısa soruyu sor. Uygulama sonunda gerçekten çalıştırdığın testleri ve kalan sınırları yaz, görev durumunu ve devir notunu güncelle. Tüm planı veya geçmişi tekrar özetleme.

### Devir defteri

- Son tamamlanan görev: **yok; bu dosya plan teslimidir.**
- Sonraki görev: **C00**, ardından C01–C03 ile ilk Studio entegrasyonu.
- Bilinen mevcut altyapı: page-document motoru ve ayrı demo; ana Studio henüz Pages/frame editor içermiyor.
- Açık kritik karar: K4 sistem bağlantısı/silme/import davranışı; preset/save önerileri henüz ürün onayı değil.
- Bu plan turunda uygulama kodu/test değiştirilmedi; build/browser çalıştırılmadı.
- Görev kaydı biçimi: `Cxx | tarih | değişen dosyalar | komut ve sonuç | sınırlamalar | sonraki görev`.
