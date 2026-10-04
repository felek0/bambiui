# bambiui · Studio canvas composer uygulama planı

Tarih: 2026-10-03
Durum: **tarihsel uygulama planı; güncel teslimat özeti `roadmap.md` ve README içindedir.**

## Son revizyon — canvas odaklı çalışma alanı

2026-10-03 tarihli yeni kullanıcı isteği doğrultusunda önceki eşzamanlı Components/Pages düzeni yerine Project/System ayrımı, solda Layers/Assets ve sağda yalnız seçimi düzenleyen Design/Project panelleri uygulandı. Frame ölçüleri ve isteğe bağlı auto layout; tüm düğümlerde dört kenar/köşe, boyut, tipografi ve yüzey override'ları; Card alt katmanları; form alanı parçaları ve hata mesajı konumu/ikonu; proje içi kaydedilebilir bileşen şablonları teslim edildi. Mevcut kayıtlar ve token şeması korunur. Kaydedilen şablonlar bağımsız kopyalardır; linked master-instance yayılımı, cross-project kütüphane ve responsive runtime export bu teslimata dahil değildir. Aşağıdaki C00–C12 maddeleri tarihsel kapsamı anlatır; güncel özellik durumunda roadmap özeti önceliklidir.

Ürün kapsamının kanonik özeti [roadmap.md](roadmap.md), teknik geçmiş [interface-composer-plan.md](interface-composer-plan.md). Bu dosya üçüncü bir ürün roadmap'i değil; onaylanan Studio/Figma benzeri yönün düşük bağlam maliyetli görev defteridir. Çelişkide son açık kullanıcı kararı esas alınır, ilgili belgeler birlikte düzeltilir.

## 1. Amaç ve başarı tanımı

Kullanıcı mevcut Studio'dan ayrılmadan:

1. Ayrı yönetilen projelerden birini açar veya yeni proje oluşturur; projenin design system bağlantısını seçer.
2. Sol menüde **Components** altında projenin bağlı olduğu sistemle render edilen mevcut yedi komponenti görür.
3. Aynı panelde hemen altındaki **Pages +** ile sayfa oluşturur.
4. Sayfanın canvas'ına Web, Tablet, Mobile frame'leri ekler.
5. Komponent, Stack ve Grid'i doğrudan frame'e sürükleyerek tasarım kurar.
6. Canvas'ta öğe seçer, taşır, sıralar; sağ inspector'dan instance/layout özelliklerini değiştirir.
7. Frame'leri bağımsız düzenler. Mobilde web'dekinden farklı içerik, komponent ve sıra olabilir.
8. Projenin design system'ini sonradan değiştirir; sayfa/frame içeriği korunurken görünüm yeni sistemden beslenir.
9. Kaydı yenilemeden sonra geri açar, Undo/Redo ve taşınabilir yedek kullanır.

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
- Design system'ler ve projeler ayrı varlıklardır, ayrı yönetilir. Sayfaların sahibi sistem değil projedir.
- Her proje değiştirilebilir bir design system referansı kullanır; proje oluşturulduktan sonra sistem değiştirilebilir.
- Birden fazla proje aynı design system'i kullanabilir. Sistem seçicide gezinmek, açık projenin bağlantısını değiştirmek değildir.
- Projenin frame'leri ortak bağlı design system ve komponent kütüphanesinden beslenir.
- Context Menu gerekli olduğunda UX'i destekleyebilir; zorunlu bir ilk adım değil.

### Uygulama önerileri — kullanıcı kararı diye sunma

| Konu | Önerilen başlangıç | Ne zaman karar gerekir? |
| --- | --- | --- |
| Yeni sayfa | Boş canvas + Add frame; üç frame zorla oluşturulmasın | C04 öncesi UI varsayımı olarak belirt; kolay değişebilir tut |
| Frame presetleri | Web 1440×900, Tablet 768×1024, Mobile 390×844; ölçüler düzenlenebilir | C04; bunlar cihaz sertifikası veya runtime breakpoint değildir |
| Proje/sistem bağlantısı | Onaylandı: proje kendi ID/name/pages verisini taşır; `systemId` yalnız değiştirilebilir referanstır | C01/C02; projeyi sistem namespace'ine bağlama |
| Sistem değiştirme UX'i | Project settings → Design system → hedefi seç → etki önizle/onayla; tek project history adımı | C03; user props korunur, otomatik reset yok |
| Sistem silme | Bağlı proje varsa silmeyi engelle, önce projeyi başka sisteme bağlamayı öner; projeyi cascade-delete etme | K4'ün silme politikası için kullanıcı onayı; bağlantı kararı zaten verildi |
| Aynı ID'ye sistem import | Mevcut sistemin güncellemesi gibi tüm bağlı frame'leri etkiler; uyarı açık olmalı | K4; mevcut import akışı incelenmeli |
| Kayıt | Doğrulanmış atomik düzenleme sonrası otomatik yerel kayıt; açık JSON yedeği ve hata durumu | C02/C03; demo'nun explicit-save davranışını sessizce kopyalama |
| Kod teslimatı | Önce seçili frame için mevcut kaynak + CSS/theme çıktısı | K2 onayı, C11 |
| Responsive runtime | Bağımsız frame'lerin ekran aralıklarına açık eşlenmesi; otomatik ağaç birleştirme yok | Ayrı karar/görev; ilk canvas dilimini engellemez |

K4'ün **ayrı proje/sistem yönetimi ve sonradan değiştirilebilir referans** kısmı onaylandı; silme/import/recovery ayrıntıları hâlâ karar gerektirebilir. K1–K5'in diğer kısımları bu planla onaylanmış sayılmaz. Bu tarihsel planda K3 kapsam dışıydı; son kullanıcı isteğiyle proje içi reusable snapshot şablonları eklendi, linked master-instance modeli eklenmedi. Gerçekten gerekli onayı ilgili göreve geldiğinde **tek, kısa soruyla** al; bütün projeyi tekrar tartışmaya açma.

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

### Proje ve design system yönetimi

- Projects ve Design systems ayrı yönetim listeleri/eylemleridir. İki dropdown aynı şeyi değiştiriyormuş gibi sunulmaz.
- Project selector açık projeyi değiştirir; ad ve bağlı sistem Project settings içinde görünür. Sayfa/frame listesi projeye aittir.
- Design systems yönetiminde sistem oluşturma/isimlendirme/token düzenleme/çoğaltma, projeyi değiştirmeden yapılır. Projede kullanılan sistemi düzenleme eylemi açık hedef ID ile ilgili sistemi açar.
- Proje canvas'ı `project.systemId` üzerinden sistem çözer; global sistem editöründe en son bakılan `SystemCollection.activeId`'yi kullanmaz.
- Change design system açık proje işlemidir: hedefi önizle, instance override etkisini bildir, onayla. Global sistem switch bu komutu çağırmaz.
- Aynı sistemi kullanan diğer projeler token düzenlemeden etkilenir; yalnız bir projenin referansını değiştirmek diğerlerini etkilemez.

### Sol panel

- Mevcut Foundations kalır; Components listesi altında Pages yer alır.
- Component satırına tıklama mevcut global komponent düzenlemeye gider. Page açıkken ayrı tutamaç/Insert alanıyla sürüklemek navigation başlatmaz.
- Pages yalnız açık projenin sayfalarını gösterir; proje yoksa Create/Open project empty state. Pages: ekle, seç, yeniden adlandır; sil/çoğalt görünür menüde ve uygun context menu'de.
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
// ComposerDocument bir projenin kalıcı belgesidir; sistemin alt kaydı değildir.
type ComposerDocument = {
  version: 1;
  id: string; // kararlı projectId
  name: string;
  systemId: string; // değiştirilebilir referans, sahiplik/namespace değil
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

- ProjectCollection sürümlü ayrı bir indeks/depo sözleşmesiyle proje ID'lerini ve aktif proje seçimini yönetir. Bir projeyi yeniden adlandırmak veya sistemini değiştirmek ID/storage konumunu değiştirmez. Proje çoğaltma yeni project/page/frame/node ID'leri üretir; sistem referansını paylaşır, sistemi otomatik çoğaltmaz. Sistem çoğaltma projeleri otomatik kopyalamaz.
- Frame label/preset düzenlenebilir başlangıç bilgisidir; width/height gerçek kaynak. Ölçü değişince preset/custom tutarlılığı deterministik tanımlanır.
- Node ID'leri en az frame içinde tekil; editor selection `{projectId, pageId, frameId, nodeId}` ile adreslenir. DOM element ID'leri ayrıca instance/frame scope'lanır. `data-page-node` tek başına bütün canvas'ta tekil sanılmaz.
- Duplicate frame/page yeni frame/page/node ID'leri üretir; kendi iç referansları birlikte günceller. Shared component tanım ID'leri kopyalanmaz. Gizli cross-frame node bağlantısı kurulmaz.
- Mevcut tek-frame motoruna adapter: frame root'u geçici `PageDocument` olarak doğrula/düzenle; koleksiyon içinde ikinci document ID/name kopyası tutma.
- Parser exact-key allowlist, finite sayı, pozitif ölçü, benzersiz ID ve sınırlı uzunluk kullanır. Başlangıç limit önerileri: proje başına 20 sayfa, sayfa başına 10 frame, belge toplamı 2000 node, frame başına mevcut 100 node/12 derinlik. Bunları ayrı sabitler ve boundary testlerle doğrula; ürün limiti diye gizleme.
- Çoklu belge JSON import byte kotasını ayrı tanımla (öneri 5 MiB); tek-page importer'ın mevcut 1 MiB sınırını gevşetme. Büyük image/base64 bu sürümde yok.
- Eski demo storage okunup silinmez. Eski bundle import'u açık kullanıcı eylemiyle bir yeni page/frame'e dönüştürülebilir; tema uyuşmazlığı sessizce aktif sistemi değiştirmez.

### Kalıcı veri / geçici state ayrımı

| Kalıcı belge | Oturum/editor state |
| --- | --- |
| Proje ID/ad, sayfalar, frame ölçü/konum, node ağacı, instance props, değiştirilebilir systemId | Kamera, hover, selection, drag session, context menu, inspector draft, Preview modu |
| Açık yedekte sistem snapshot'ı | Undo/Redo varsayılan olarak oturumluk; yedeğe eklenmez |

Proje adı/systemId değişimi, page/frame işlemleri ve node işlemleri **proje başına tek composer history** üzerinden yürür. Frame bazlı motorun history'sini iç içe çalıştırma. Token geçmişi ayrı kalır. Aktif editöre göre Undo/Redo hedefi ve accessible label değişir; input'un native undo'su engellenmez. Proje switch'i history'nin yanlış projeye uygulanmasını engeller. Projenin systemId değişimi mevcut proje geçmişini sıfırlamaz; Undo/Redo referansı da geri alır. History'deki eski systemId artık mevcut değilse sessiz fallback uygulanmaz; restore işlemi durdurulup açık recovery gerekir. Token undo bağımsızdır; proje Undo'su global sistem tokenlarını geri almaz.

### Kayıt ve sistem ömrü

- Projeler için sistem deposundan ayrı sürümlü indeks ve **projectId bazlı** belge kaydı. Sistem ID'si storage namespace değildir. Proje yüklenmeden yazma yok; proje/sistem yükleme durumları ayrı tutulur. İndeks-belge tutarlılığı ve yarım yazma recovery'si test edilir.
- Storage okumada parse/migration başarısızsa ham veri korunur ve autosave bloke edilir; explicit recovery gerekir.
- Kayıt önce doğrulanır. Kota/erişim hatasında state kalır, “Saved” gösterilmez; yedek ve retry sağlanır.
- Save-time değişim kontrolü diğer sekmenin kaydının üzerine sessiz yazmayı engeller; atomik kilit veya sync olduğu iddia edilmez.
- Proje switch sırasında pending kayıt ya tamamlanır ya görünür hata ile korunur; yeni projenin anahtarına eski belge yazılmaz. Sistem editörü switch'i proje belgesini değiştirmez.
- Change design system: hedef sistem mevcut/geçerli ve registry ile uyumlu olmalı; proje içindeki tüm kind/variant/size/tone/radius/ikon referansları değerlendirilir. Hata varsa referans ve belge değişmeden kalır. Başarıda yalnız systemId değişir, project/page/frame/node ID, içerik ve layout korunur.
- Instance prop override'ları korunur; yeni sistem varsayılanını örtebilecekleri önizlemede belirtilir. Override temizleme ayrı açık işlemdir; otomatik recolor veya ölçü dönüşümü yoktur. Ortak built-in registry için mevcut prop allowlist esas alınır; gelecekteki özel komponent mapping'i bu dilime gizlice eklenmez.
- Aynı systemId'ye token güncellemesi bağlı tüm projelerin görünümünü değiştirir; bu işlem sistem history'sindedir. Yeni sisteme bağlanma yalnız açık projeyi etkiler, sistem kayıtlarını değiştirmez.
- Eksik/silinmiş sistem referansı proje parser'ında içeriği silme sebebi değildir. Structure parser ve referans çözümleme ayrılır; unresolved durumda belge korunur, görünüm/source export açık hata verir ve mevcut sisteme rebind/recovery sunulur. Sessiz default sistem yok.
- Sistem silme/replace/duplicate için kalan K4 kararı uygulanır; projeleri/sayfaları sessizce taşıma/silme. Proje silme sistem kaydını silmez; sistem çoğaltma projeleri kopyalamaz.

### Proje yedeği ve import

- Portable backup proje belgesini ve o anda bağlı sistemin detached snapshot'ını içerir; normal kayıt canlı systemId referansıdır. Snapshot proje içinde ikinci editable sistem değildir.
- Import'ta aynı systemId var diye yerel sistemin üzerine yazma. Kullanıcı mevcut sistemi seçebilir veya snapshot'ı yeni systemId ile ayrı sistem olarak import edebilir; projenin referansı açıkça buna eşlenir.
- ID collision halinde yeni proje/page/frame/node kimlikleri veya açık replace işlemi; replacement onayı olmadan yerel proje/sistem değişmez. İki depoya yazma başarısızlıklarında kısmi import/recovery politikası test edilir.
- Seçili frame source export'u her zaman **projenin bağlı sistemini** çözer; sistem editöründeki activeId'yi değil. Unresolved sistemde export durur.

## 6. Render, layout ve koordinatlar

- Canvas frame konumu/zoom editor verisidir; React sayfa çıktısına `position:absolute; left:canvasX` olarak sızmaz.
- Frame içi varsayılan düzen Stack/Grid; içerik içinde sınırsız x/y modeli bu ilk işin kapsamı değildir.
- Frame root kendi genişliğini doldurmalı. Bugünkü Container narrow/wide kısıtını tüm tasarıma zorlamamak için ayrı frame root ya da geriye uyumlu full-width seçenek tasarla. Varsayılanları değiştirme.
- Web frame küçük editör alanında da 1440 CSS px kalır; canvas kamera ölçekler. `max-width:100%` ile mobile daralırsa yanlış preview olur.
- Bir frame viewport değildir. Container query kullanan layout çalışır; media query tüketicileri için iframe/izole viewport gereksinimi ayrı karardır. Gerçek viewport testi iddiası yapılmaz.
- İçerik yüksekliği frame'i aşınca ilk politika açık olmalı: design modunda overflow/hint görünür, hedef görünmez biçimde kaybolmaz. Fixed height/clipping davranışı Preview ve export'ta aynı tanımlanır.
- Her frame açık projenin `systemId` ile çözülen sistem/theme CSS değişkenleriyle scope'lanır; global sistem editörü activeId'siyle değil. Çoklu `<main>`, tekrarlanan input ID ve label association hatalarından kaçın.
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

- `model.ts`, `model.test.mjs`: proje belgesi + çoklu page/frame parser, adapter, limitler; reference validation ayrımı.
- `commands.ts`, `history.ts`, testleri: project name/system reference + page/frame + node atomik işlemleri.
- `storage.ts`, testleri: projectId bazlı güvenli local kayıt/indeks/import/backup; system deposuyla açık sınır.
- `projects-panel.tsx`, `project-settings.tsx`: ayrı proje yönetimi ve Change design system; ihtiyaç oldukça oluştur.
- `use-composer.ts`: state/history/persistence orchestration; UI dışında saf işleri burada yığma.
- `pages-panel.tsx`, `layers-panel.tsx`, `insert-panel.tsx`.
- `composer-canvas.tsx`, `frame.tsx`, `selection-overlay.tsx`.
- `camera.ts`, `drop-target.ts`, saf geometri testleri; `use-canvas-gesture.ts` gerekirse.
- `inspector.tsx`, `context-actions.tsx`, `composer.module.css`.
- `scripts/studio-composer-smoke.mjs`: gerçek Studio uçtan uca kontrolü.

`studio.tsx` yalnız aktif workspace, proje bağlamı, sistem editörü bağlamı ve editor bridge bağlar. `activeProjectId` ile sistem editörünün `activeId`'si ayrı state'tir; `projectSystem` açık projeden çözülür. Tüm composer'ı mevcut 1000+ satırlı dosyaya ekleme. Önce minimal seam oluştur; büyük refactor ile token davranışlarını aynı anda değiştirme.

### Static routing önerisi

Statik `app/(workspace)/pages/page.tsx` marker route + client-side project/page/frame selection kullan. İsteğe bağlı `#project=...&page=...&frame=...` hash deep link; hash parser saf testli, back/forward ve eksik ID fallback belirli olmalı. Kullanıcı ID'sine göre build-time route üretilmez. `/pages` route'u token selection fallback'ına düşüp Colors gösteremez. `useSearchParams` seçilirse installed Next rehberi/Suspense/static-export gereksinimleri ayrıca uygulanır; sırf route için SSR'a geçilmez.

Design/Develop davranışı açık olsun: Page açıkken Develop'a geçiş ilgisiz Button dokümanına sessizce atlamaz. Frame source paneli henüz yoksa açıklamalı disabled durum veya açık component-reference bağlantısı; karar C03'te kaydedilir. Component nav geri dönüşünde mevcut specimen ve token inspector aynen çalışır.

## 8. Küçük görevler — sırayla yürüt

Her görev sonunda status'u `[ ]` → `[x]` yalnız kabul kanıtı varsa değiştir. Yarı bitmiş görev `[~]`; engeli yaz. Bir turda bir görev; bağımsız saf testler dışında paralel UI editörü çalıştırma.

### [~] C00 — Sözleşme ve karar kapısı

**Oku:** bu dosya §§1–7, `systems.ts`, `studio.tsx` sistem activate/import/delete kısımları, model/registry.

**Yap:** Ayrı proje/sistem yönetimi ve sonradan systemId değiştirme onaylıdır; bunu tekrar sorma. K4'ün yalnız silme/import/recovery açıklarını kısa onayla netleştir; preset/yeni sayfa/save varsayımlarını belirt. Çoklu frame/root/route/history scope kararını tek karar kaydında netleştir. DnD kararı C07'ye bırakılabilir.

**Kabul:** project switch ile sistem editörü switch/rebind ayrımı, sistem silme/import/recovery davranışı ve frame export sınırı belli; “bağımsız frame” ortak ağaca dönüşmemiş. Kod değişimi şart değil.

### [x] C01 — Proje ve çoklu sayfa/frame saf modeli

**Yazma alanı:** yeni composer model ve testleri; gerektiğinde page-document adapter testleri.

**Yap:** parse/create project + page/frame, proje adı/değiştirilebilir systemId referansı, proje indeks sözleşmesi, ID üretimi caller'dan, bağımsız kökler, sınırlar. Structural parse ile sistem referansı çözümlemesini ayır. Token şeması ve eski v1 parser davranışı korunur.

**Kabul:** iki ayrı proje aynı sisteme referans verebilir; başka sisteme geçiş proje/page/frame/node kimlik ve içeriğini değiştirmez. Eksik referans belgeyi silmez. project/page/frame model fixture'ı, bağımsızlık, duplicate ID, unknown key, NaN/Infinity/negatif ölçü, limit eşikleri, no mutation, eski belge adapter round-trip testleri geçer.

C01 uygulama kaydı: `app/studio/composer/model.ts` ve `model.test.mjs` eklendi. `parseComposerDocument/Page/Frame`, `parseProjectCollection`, caller-ID factory'leri, `resolveComposerSystem/validateComposerSystemReference` ve eski tek-root belge adapter'ları vardır. Structural parse eksik sistem referansını korur; resolver yalnız caller'ın doğrulanmış katalogunda varlığı kontrol eder, token/registry uyumluluğu C02'de ele alınır. Proje ID/ad/systemId/pages, page ID/ad/frames ve bağımsız frame kökleri doğrulanır; hiçbir UI/storage uygulanmış değildir.

Uygulanan teknik başlangıç değerleri ürün onayı değil değiştirilebilir prototip sabitleridir: 20 sayfa/proje, 10 frame/sayfa, 2000 node/proje, mevcut 100 node/12 depth/frame. Ölçüler 1–10000, koordinatlar ±100000, finite/fractional değerler korunur. Web 1440×900, Tablet 768×1024, Mobile 390×844; farklı ölçü için `custom` gerekir. Factory frame'i (0,0)'da açık boş Container ile oluşturur. Page ID proje içinde, frame ID proje genelinde, node ID frame içinde tekildir; UUID/system `original` kabul edilir. Index yapısal olarak proje ID'leri ve nullable activeProjectId taşır; proje sayısı/storage byte kotası henüz tanımlı değildir. JSON importer C02/C10'dadır.

Doğrulama: 21 yeni model testi; tüm suite 209 geçti. TypeScript ve hedefli ESLint geçti. Saf model değişikliği için build/browser tekrar çalıştırılmadı. C00'ın silme/import/recovery kararları kapanmadan ilgili yıkıcı UI işlemleri uygulanmaz; bu kararlar saf C01'i engellemedi.

### [~] C02 — Komut/history ve güvenli storage

**Yazma alanı:** composer commands/history/storage + testler.

**Yap:** create/rename/duplicate project; page/frame CRUD, move/resize frame, node adapter; `changeProjectSystem` atomik komutu ve proje başına history. Hedef mevcut/uyumlu değilse değişiklik yok. ProjectId bazlı kayıt/indeks/revision kontrolü, proje silme ve indeks recovery politikası. Silmede undo ve seçim fallback politikası.

**Kabul:** rebind tek undo/redo, diğer projelerin referansı ve iki sistemin tokenları değişmez; başarısız/eksik-system restore güvenli. Atomik fail/no-op/redo, bounded history, duplicate subtree ID remap; quota/corrupt/cross-tab/hydration guard testleri. Token undo geçmişi etkilenmez. Yeni document byte sınırı açık.

C02 çekirdek kaydı: `commands.ts/history.ts/commands.test.mjs` ve `storage.ts/storage.test.mjs` eklendi. Project rename/rebind; page/frame insert/rename/delete/duplicate/reorder; frame geometry ve eski motoru kullanan frame-scoped node batch'leri vardır. Batch ve node batch sınırı 100; saf komutlar eski state/payload/catalog'u değiştirmez. Dimension değişince preset `custom` olur; caller'ın tam ID mapping'iyle duplicate yapılır. Model sınırları her işlemde uygulanır; cross-frame C08'e bırakıldı.

History proje snapshot'ıdır: default 50, 1–100 adım; no-op/hata redo'yu korur, gerçek branch temizler. `changeSystem` hedef katalog gerektirir; built-in prop uyumu mevcut page parser üzerinden korunur, custom registry mapping yoktur. `undoComposer/redoComposer` katalog parametresi verilirse restore sisteminin varlığını kontrol eder; **Studio bridge her zaman güncel doğrulanmış katalog vermelidir**, katalog atlanması yalnız structural kullanım içindir. Eksik restore hedefinde hata gelir, fallback yoktur.

Storage anahtarları `bambiui.composer.projects.v1` ve projectId tabanlı `bambiui.composer.document.v1.*`; envelope version/revision/document taşır. Read write yapmaz; corrupt kayıt korunur. Expected index/document raw + revision karşılaştırması stale save'i reddeder; bu atomik lock değildir. Yeni proje önce belgeyi sonra indeksi yazar; indeks hatasında `partial` ve orphan kanıtı döner, başarı etiketi verilmez. `registerComposerProject` açık retry ile aynı korunmuş belgeyi indekse ekler; overwrite/remove yoktur. Teknik quota: belge 5 MiB UTF-8, indeks 256 KiB ve 1000 proje; legacy 1 MiB değişmedi.

C02 takip dilimi tamamlandı: `duplicateComposerProject(input, projectId, name, pages)` tam caller ID mapping'iyle bağımsız proje kopyası üretir; systemId/content/props/geometri korunur, token kopyası ve otomatik kayıt yapılmaz. Source history değişmez; controller kopyayı fresh history ile açar. `selectComposerProject(storage, activeProjectId, reference, expectedIndexRaw)` indeksi ve hedef belgeyi doğrular, yalnız indeks yazar; null seçimi kabul eder, no-op yazmaz, stale/quota/corrupt durumda kayıt korunur. Create → select → save → duplicate/register → switch entegrasyon testi vardır.

C02'nin yalnız destructive proje silme/reset/import-replace politikası açık kaldı; portable backup UI C10'dadır. Bu nedenle C02 kısmi işaretlidir, fakat C03'ün non-destructive Projects/Pages entegrasyonu için teknik seam hazırdır. UI silme/replace eylemlerini onay gelene kadar sunmaz.

Doğrulama: ilk C02 diliminde 23 command/history + 23 storage testi, takip diliminde 13 ek test; toplam 268 test, proje TypeScript, composer ESLint ve tam `npm run lint` geçti. Build/browser çalıştırılmadı; saf altyapı, Studio UI değil.

### [x] C03 — Ayrı Projects/Design systems ve Studio Pages entegrasyonu

**Yazma alanı:** `studio.tsx` küçük bridge, marker route, pages panel/controller/CSS/copy.

**Yap:** ayrı Projects/Design systems yönetim girişleri; proje oluştur/aç/yeniden adlandır, Project settings'ten sistem seç/değiştir. Açık projede Components altına Pages +; boş sayfa oluştur/seç/yeniden adlandır. Gerçek canvas boş state; demo linki değil. Ayrı token/page inspector ve Undo hedefi. Project switch ve sistem editörü switch'i ayrıştır; safe reload.

**Kabul:** aynı Studio shell içinde iki proje ve sayfaları ayrı açılır. Sistem yöneticisinde gezinme proje referansını değiştirmez. Proje sistemi değişince sayfalar/kimlikler kaybolmaz; işlem undo edilir ve refresh'te kalır. Aynı shell'de 2 sayfa oluşturulur, seçim ve refresh çalışır; component navigation geri dönüşünde token editor bozulmaz; `/pages` static build'de açılır. Bozuk kayıt üstüne yazılmaz. Bu görevde frame zorunlu değil.

C03 uygulama kaydı: `controller.ts`, `use-composer.ts`, `project-ui.tsx`, `composer.module.css`, route helper/testler ve `app/(workspace)/pages/page.tsx` eklendi; `studio.tsx` küçük bridge ile bağlandı. Aynı shell içinde Projects ve Design systems ayrı yöneticidir; create/open/rename/duplicate project, proje-owned Pages +/select/rename ve ayrı project/page inspector çalışır. Project settings rebind Light/Dark hedef token-impact önizlemesi ve onay içerir; frame render önizlemesi değildir. Rebind tek history adımı, otomatik kayıt; global system switch referansı değiştirmez. Page Develop/export açıkça unavailable.

Hydration yazmaz; state controller projectId sessions/expected raw/revision tutar. Doğrulanmış işlemler synchronous save yapar; save error bellekte korunur/retry, partial registration evidence açık retry sunar. Eksik sistem referansı fallback yapmadan korunur/rebind edilebilir. Proje/sistem delete/import-replace yeni UI'da yoktur. Mevcut sistem silme eylemi kayıtlı proje veya session-history referansı ya da okunamayan proje kaydı varsa **koruyucu olarak engellenir**; bu provisional veri güvenliği guard'ıdır, son silme politikası onayı değildir. Component/token history ayrıdır; Pages history güncel katalogla restore edilir.

Sınırlar: page seçimi/history oturumluk; reload aktif projeyi ve ilk sayfayı açar. Merkezi canvas boş state'tir; kayıtlı frame'ler korunur fakat C04 öncesi render edilmez. Acil in-memory project JSON download sistem snapshot'ı içermez; portable project backup C10'dadır. Frame/DnD ve source export teslim edilmedi.

Doğrulama: 18 controller/route testiyle toplam 286 unit testi, TypeScript, tam ESLint, production build, 13 grupluk `studio-composer-smoke.mjs`, mevcut `studio-smoke.mjs` ve diff kontrolü geçti. Proje/sayfa ayrımı, rebind/Undo/Redo, system browsing isolation, reload, component regression, runtime/hydration ve 375px overflow test edildi; görsel/VoiceOver/cross-browser kabulü değildir.

### [x] C04 — Bağımsız frame'ler ve canvas kamera

**Yazma alanı:** frame/canvas/camera ve inspector frame alanları; model komutlarıyla entegrasyon.

**Yap:** Web/Tablet/Mobile/custom frame ekle, yeniden adlandır/çoğalt; başlıktan taşı, ölçü alanlarından değiştir; gerçek genişlikli canvas'ta pan/zoom/Fit. İlk frame hit-test ve seçimi.

**Kabul:** üç frame birlikte görünür, ölçüler CSS px olarak doğru; zoom geometriyi export verisine yazmaz; frame taşıma tek undo; light/dark tokenları tüm frame'lere aynı sistemden gelir. Blank frame drop alanı vardır. Dar editör geniş frame'i daraltmaz.

C04 kaydı: `composer-canvas.tsx`, `frame.tsx`, `frame-inspector.tsx`, `camera.ts`, `use-canvas-gesture.ts`, frame helper/testleri eklendi; controller/project UI/Studio bridge ve composer smoke genişletildi. Frame'ler aynı canvas'ta gerçek CSS px boyutlarıyla çizilir; preset ekleme, seçim, rename/duplicate ve width/height/X/Y draft düzenlemesi vardır. Boyut değişimi `custom` olur. Başlıktan threshold + rAF drag yalnız drop'ta tek history/save yapar; Escape/pointercancel/blur commit yapmaz. Kamera oturumluk 10–400%, pointer-anchored zoom, pan, Fit page/selection ve görünür yardım sunar. Wheel/trackpad pan için canvas odağı gerekir; Space/middle-mouse pan alternatifidir.

Frame kökü `RenderPage` ile projenin bağlı systemId + seçili Studio theme değişkenleri altında çizilir; font yükleme de bağlı sistemi izler. İçerik inert editor preview'dur; fixed-height clipping açıkça etiketlenmiştir. Bu viewport media-query emülasyonu veya frame export parity kanıtı değildir. Empty frame alanı sonraki insertion için görünürdür. Touch gesture, node seçimi ve component/layout insertion henüz yoktur.

Doğrulama: toplam 296 unit, TypeScript, ESLint, production build, 19 grupluk Studio composer smoke ve mevcut Studio smoke geçti. Frame width/position, kamera-kayıt ayrımı, title drag/undo/reload, cancel, linked-system paint ve 375px overflow kapsandı; görsel/manuel a11y kabulü açık.

### [x] C05 — Yedi komponent ve frame/layout sözleşmesi

**Yazma alanı:** page-document registry/model/render/export + testler; layout yalnız gerekiyorsa.

**Yap:** Checkbox/Badge ekle; mevcut yedinin güvenli ve tasarım için gerekli props'larını component API'yle eşle. Root full-width çözümü, empty frame insert, Grid.Item/Card slot defaultları. Callback/raw ReactNode/icon JSX JSON'a girmez; ikon gerekiyorsa allowlist ID.

**Kabul:** yedi komponentin palette node fabrikası geçerli ağaç üretir; radius/variant/size/tone consumer ile aynı; her yeni prop renderer/export parity ve üretilen TSX testinde. Yeni token eklenirse proje kurallarındaki tüm consumer/reset/import/export/audit işleri yapılır; sırf composer için gereksiz token yaratılmaz.

C05 kaydı: page-document registry/render/export yedi built-in komponenti ve Card.Footer'ı destekler. Design-safe prop/unsupported matrisi `docs/page-document.md` içindedir; callback/raw ReactNode/style/className/keyfi attributes/icons yoktur. Controlled checked/value yalnız snapshot'tır, controlled/default çiftleri birlikte reddedilir; edit edilebilir uygulama state'i olduğu iddia edilmez. Komponent API/token şeması ve omitted prop/radius inheritance değişmedi.

Container `maxWidth="full"` geriye uyumlu eklendi: 100% border-box, max-width ve inline padding yok. Yeni composer frame kökü bunu açık prop olarak taşır; eski/import root geometri ve varsayılanları korunur. `composer/insertion.ts` ve shared `page-document/defaults.ts` saf node fabrikası/atomik proposal sağlar: frame-root control için Stack, Grid için Grid.Item, Card için mevcut/yeni Card.Content hedefini ve hint'i açıkça döndürür. Ancestor fallback yoktur; nested-form/slot/limit kontrolleri eski motordadır. UI palette/selection/DnD eklenmedi.

Copied Checkbox dependency yolunda açığa çıkan Node-only `Buffer` brand encoding'i aynı UTF-8 base64 çıktılı browser-compatible encoder'a çevrildi; consumer browser kontrolüyle doğrulandı. 307 unit testi, TypeScript/lint/build, generated TSX + SSR/direct-component parity, copied-source build/browser (Checkbox hydration ve full-width 1440/768/390px), Studio composer/Studio/demo smoke ve diff kontrolü geçti. Fresh install/cross-browser/manual a11y veya clipped frame export parity kanıtı değildir.

### [x] C06 — Canvas selection, hover, instance inspector

**Yazma alanı:** selection overlay/layers/inspector ve saf selection helper'ları.

**Yap:** frame/node click, hover outline/label, Escape, Select parent; sağ panel kompakt gerçek props. Boş alanın seçimi ve ancestor path. Design/Preview etkileşim ayrımı. Native input draft/undo korunur.

**Kabul:** outline layout shift yapmaz; zoom/pan sonrası node ile hizalıdır; mobil frame'de metin değiştirmek web'i değiştirmez; instance prop değişimi global token kaydını değiştirmez. Global sistem renk değişikliği frame'lere yansır.

C06 kaydı: `selection.ts`, `node-overlay.tsx`, `node-inspector.tsx` ve controller/frame/gesture bridge eklendi. Seçim project/page/frame/node adreslidir; farklı frame'lerde aynı node ID güvenlidir. En yakın geçerli node click, hover label/outline, clipped ve zoom-aware selected overlay, breadcrumb, Layers klavye seçimi, Select parent, Escape ve undo/page/project değişiminde fallback vardır. Overlay layout'u değiştirmez; focus göstergesinden ayrıdır.

Design kontrol aktivasyonunu engelleyip selection sunar; Preview gerçek kontrolleri açar, node seçimi kapalı ve form submit/network engellidir. Controlled checked/value snapshot olarak sabit kalır; callback binding yoktur. Inspector registry enum/boolean/string/text alanlarını küçük kontrollerle düzenler; metin blur/Enter commit, invalid draft hata ve no mutation, optional clear, explicit false ve controlled/default counterpart atomik kaldırma desteklenir. Instance projenin nodeCommands yoluna gider, global tokens'a yazılmaz. Edit shared system styles açık hedef sistem/component route'una gider. Palette insertion/DnD yoktur.

Doğrulama: 313 unit testi, TypeScript/lint/build, 28 composer smoke grubu ve mevcut Studio smoke geçti. Eski 19 gruba selection geometry, Design activation block, frame/token isolation, bindings, keyboard, clipping, Preview form/network ve ortak sistem repaint testleri eklendi. Manuel görsel/a11y/cross-browser/touch kabulü açık.

### [x] C07 — Palette → canvas gerçek insertion

**Yazma alanı:** insert panel, gesture/drop-target/overlay, ortak command adapter, testler.

**Yap:** DnD yaklaşımını seç ve kısa gerekçe yaz. Önce component/Stack/Grid'i palette'den frame içine bırak. Empty frame/Grid/Card slot adapter'ları ve açık insertion ghost/çizgisi. Visible Insert + klavye alternatifi.

**Kabul:** boş frame'e Button ve Grid içine Card sürüklenir; oluşan wrapper sonucu görünürdür. Geçersiz/yabancı payload kabul edilmez; cancel sıfır değişiklik; zoom 50/100/150'de drop doğru. Her ekleme tek undo/kayıt. Sadece layer drag testi kabul değildir.

C07 kaydı: sol Insert palette yedi built-in + Stack/Grid sunar; global stil navigasyonu ayrıdır. Mouse pointer drag gerçek frame'e ekler; aynı `pointer-drag.ts` motoru palette/frame-title/pan gesture'larını tek controller owner üzerinden dışlar. Threshold, capture, rAF ghost, hedef outline/çizgi ve açıklama vardır; exact visible parent/slot kullanılır, selected ancestor fallback yoktur. Cached proposal yalnız değişen adayda doğrulanır; dragover'da storage veya her harekette parser yoktur. Pointercancel/Escape/blur/stale project/page ve geçersiz/yabancı bırakma kayıt/history değiştirmez.

Controller insertion drop'ta gerçek ID'lerle authoritative komutu doğrular; Stack/Grid.Item/Card.Content sonuçları açık hint taşır. Tek insert tek history/autosave, seçilen gerçek node'dur (wrapper değil). Klavye/tıklama seçili slot'a append alternatifi vardır; Preview palette disabled'dır. Root'un full-height hit alanı boş frame insertion'ını destekler. Mouse desteği teslimdir; touch drag yoktur. Mevcut node taşıma/reorder C08'dedir.

Doğrulama: 326 unit testi, TypeScript, tam lint/build/diff geçti. 34 composer smoke grubu (28 mevcut + 6 C07) gerçek CDP mouse palette drag ve target/zoom/cancel/invalid/storage/history akışını kapsadı; Studio regression ve 15 grup demo regression geçti. Manuel görsel/a11y/cross-browser/performance kabulü hâlâ açık.

### [x] C08 — Canvas içi reorder/reparent ve cross-frame

**Yazma alanı:** mevcut tek drag motoru ve atomik command adapter/testler.

**Yap:** seçili instance'ı canvas'ta sürükle; Stack row/column önce/sonra, Grid slot ve farklı container hedefleri. Ardından bağımsız frame'e atomik move; varsayılan taşımadır, kopyalama ayrı açık eylem.

**Kabul:** pan/drag çakışmaz; self/descendant/nested-form/tekil-slot ihlalleri engellenir; cross-frame hata kaynaktan öğe silmez; source/target undo tek adım. Kopyalama yeni IDs verir. Pointercancel/Escape ve autoscroll hedef düzeltmesi testli.

C08 kaydı: `movement.ts`, `use-node-move.tsx`, `canvas-target.ts`, `move-panel.tsx`, command/controller ve testler eklendi. Direct Design node drag/selected-label affordance aynı pointer motorunu kullanır: 4px threshold, rAF ghost/hedef/çizgi, clipped geometri ve sınırda bounded kamera pan vardır. Preview move kapalı; pan/frame-title/palette gesture'ları çakışmaz. Escape/cancel/blur/stale state/invalid/identity no-op kayda veya history'ye yazmaz.

`prepareMove/moveIndex/moveProposalCache`, `moveNode` komutu ve controller.move kaynak/hedef final ağaçlarını tek project commit öncesi doğrular. Row/column reorder post-removal index kullanır; reparent ve aynı sayfa cross-frame taşıma ID'leri korur. Hedef subtree ID collision açık hata; otomatik kopyalama/remap yoktur. Root/self/descendant/nested-form/slot/empty-source/limit kuralları korunur. Root/Grid/Card adapter hint'leri açıktır. Görünür Move instance hedef/position kontrolü klavye alternatifidir; draft blur/Enter politikası korunur. Cross-page/project ve touch/pen hareketi kapsam dışıdır.

Doğrulama: 341 unit, TypeScript/full lint/build/diff; 43 composer CDP grubu (34 mevcut + 9 C08), Studio regression ve ayrı çalıştırmada 15 demo grubu geçti. Birleşik regression komutu Studio geçtikten sonra timeout oldu; demo ayrı çalıştırılarak geçti. Manuel görsel/a11y/cross-browser/performance kabulü açık.

### [x] C09 — Context actions, duplicate, wrap ve kısayollar

**Yazma alanı:** context-actions + aynı komutları çağıran toolbar/menu; gerekiyorsa yeni wrap saf komutları.

**Yap:** verilen Base UI Context Menu API'si; görünür `…` eşleniği. Delete/Duplicate/Select parent; valid wrap Stack/Grid. Ctrl/Cmd+Z/Shift+Z ve Delete yalnız editor odağında, metin inputlarında native davranış.

**Kabul:** sağ tık hedefi doğru, disabled eylemler açık; klavye menü/Escape/focus restoration; transform dışı portal; wrap geçersiz slotu bozmaz. Context menu tek erişim yolu değildir. Tam çoklu seçim bu göreve otomatik eklenmez.

C09 kaydı: `component-actions.ts`, `context-actions.tsx`, `shortcuts.ts`, controller ve UI bridge ile Base UI ContextMenu + görünür … Actions aynı handler/disabled reason kullanır. Sağ tık geçerli node/frame'i hedefler; boş canvas eski seçime işlem yapmaz. Duplicate fresh subtree ID üretir, delete parent fallback ve Stack/Grid wrap exact slot doğrulamasıyla tek history/autosave'dir. Root/compound unique/required slot ve limit ihlalleri disabled'dır. Frame duplicate mevcut controller'dadır; yeni project/system silme eklenmedi.

Duplicate yeni node'u, wrap wrapper'ı, delete parent'ı seçer; undo geçersiz seçimi temizler. Context menu final focus stable canvas'a; visible menu trigger'a, bulunamazsa canvas'a döner. Portal zoom dışında nötr Studio renkleriyle çizilir. Canvas-only Cmd/Ctrl undo/redo/duplicate/Delete/Backspace input/textarea/select/contenteditable/composition native davranışına müdahale etmez. Preview actions disabled; menü açma aktif drag'i iptal eder.

Doğrulama: 349 unit, TypeScript/full lint/build/diff; ilk 50 composer smoke, Studio ve 15 demo regression geçti. Takip kontrolünde CDP held mouse move'da `button: left` eksikliği pointercapture kaybı yaratıyordu; plain DOM control ile aynı hata ayrıştırıldı, üretim workaround eklenmedi. Smoke event düzeltildi, preselection workaround kaldırıldı: toolbar ve temiz inspector input odağından ilk unselected-node drag, one-save/undo ve Design Button/Switch/Checkbox/Input menü activation engeli dahil 6 ek grup geçti. Son smoke 56/56 gruptur. Touch/longpress, görsel/VoiceOver/cross-browser/native zoom/forced-colors kabulü açık.

### [ ] C10 — Proje kalıcılığı, import ve sistem bağlantısı uçtan uca

**Yazma alanı:** storage/controller/system bridge ve Studio smoke; C02'yi yeniden yazma.

**Yap:** otomatik proje kayıt durumu, recovery/retry, portable project backup + bağlı system snapshot, eski page bundle açık import. Sistem ID collision/mapping ve proje ID collision'ı ayrı çöz. Sistem silme/replace/duplicate için kalan K4. İki sekme, project switch ve Change design system sırasında bekleyen kayıt testleri.

**Kabul:** refresh proje seçimi ve bağlı systemId dahil tüm page/frame/node düzenini getirir; sistem editörünün activeId'si render kaynağına sızmaz. Aynı sistemi paylaşan iki projeden birinin rebind'i diğerini etkilemez; history politikasına uygun başlangıç; invalid import mevcut belgeyi korur; sistem uyuşmazlığı kullanıcıya sorulur; kayıt hatasında canvas düzeni kaybolmaz. Tarayıcı storage'ın kalıcı yedek olmadığı açık.

### [ ] C11 — Develop ve seçili frame kaynak çıktısı

**Ön koşul:** K2 teslimat kararı; bağımsız frame runtime mapping gerekmez.

**Yap:** seçili frame için mevcut source exporter adapter; adı/importları güvenli üret. Develop görünümünü page/frame kapsamına hizala. Canvas metadata ve editor overlay CSS çıktıya sızmaz. JSON backup ile source delivery farklı eylemler.

**Kabul:** seçili frame aynı sistem/theme ile tüketici React/Next fixture'da derlenir; kaynak/stil/tema birlikte çalışır; iki ayrı frame çıktısı bağımsızdır. Responsive tek route otomatik üretildi iddiası yok. Sıfırdan install yapılmadıysa açıkça belirt.

### [ ] C12 — UX, performans ve erişilebilirlik kabulü

**Yap:** gerçek görev videosu/screenshot incelemesi ve manuel klavye, VoiceOver, native %200 zoom, forced-colors; 3 dolu frame ile interaction profiling.

**Kabul senaryosu:** kullanıcı Studio'da proje oluşturur/sistem bağlar → sayfa oluşturur → Web/Mobile ekler → Stack/Grid + yedi komponentten uygunlarını sürükler → mobile farklı bir alan ekler → canvas'ta taşır → undo/redo → token değiştirir → projenin sistemini değiştirir, diğer proje etkilenmez → undo/redo → kaydeder/refresh → backup round-trip → seçili frame kodunu tüketir. Her adım görünür UI üzerinden.

Performans: pointermove sırasında storage/JSON parser çalışmaz; gereksiz bütün canvas rerender'ları profile edilir. 60fps/WCAG uyumu ölçmeden iddia edilmez. Reduced-motion'a uy; seçim/focus animasyonu hit-test'i geciktirmesin.

## 9. Test ve doğrulama matrisi

| Katman | Zorunlu kanıt |
| --- | --- |
| Saf model | valid/invalid, strict keys, limits, immutability, bağımsız frame, ID remap |
| Commands/history | atomic batch, source/destination, cancel/no-op, redo branch, geometry grouping |
| Storage | projectId isolation, hydration no-write, corrupt preserved, quota, conflict, project switch, rebind, backup/import mapping |
| Registry/render/export | yedi komponent, slot/props, SSR parity, TSX derleme, gerçek stil tüketimi |
| Koordinatlar | pan offset, scroll, zoom inverse, insertion index, row/column, empty targets |
| Studio browser | project→page→frame→palette drop→canvas move→inspector→change system→undo→reload; ayrı sistem yönetimi ve token regression |
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

- Son tamamlanan görev: **C09 — context/visible actions, duplicate/wrap/delete ve kısayollar**; C02 destructive policy kısmı açık.
- Sonraki görev: **C10 — portable proje backup/import, lifecycle/recovery kabulü**. Kalan C00 silme/import çatışma kararlarını bu görevin ilgili yıkıcı işleminden önce netleştir; ayrı proje/sistem kararını tekrar sorma. Prop matrisi için `docs/page-document.md` oku. Ayrı demo üzerinde çalışma. C00'ın kalan silme/import/recovery kararlarını ilgili işten önce netleştir; ayrı proje/sistem ve değiştirilebilir bağlantıyı yeniden onaylatma.
- Bilinen mevcut altyapı: composer model/command/history/storage/controller, gerçek Studio Projects/Pages ve project settings; ana Studio frame render/geometry/camera içeriyor; node selection/hover/instance edit ve Design/Preview vardır; palette→canvas mouse insertion vardır; mevcut node reorder/reparent ve aynı sayfa cross-frame mouse move vardır; context/visible actions ve canvas kısayolları vardır; portable backup/import/lifecycle kabulü C10.
- Son kullanıcı kararı: **sistemler ayrı, projeler ayrı yönetilir; proje sonradan farklı design system'e bağlanabilir.** Sayfalar sistemin değil projenin verisidir. Bu revizyon dokümantasyondur, uygulandı anlamına gelmez.
- Açık kritik karar: K4'ün silme/import/recovery ayrıntıları; preset/save önerileri henüz ürün onayı değil.
- C01 | 2026-10-03 | `app/studio/composer/model.ts`, `model.test.mjs` | 209 test, TypeScript, hedefli ESLint geçti | UI/storage ve destructive policy yok; build/browser çalıştırılmadı | C02.
- C02 (kısmi) | 2026-10-03 | composer commands/history/storage ve 2 test dosyası | 255 test, TypeScript, composer ESLint geçti | aktif-index seçimi/proje duplicate/delete policy ve UI yok; build/browser çalıştırılmadı | C02 kalan seam.
- C02 takip | 2026-10-03 | composer commands/storage ve testleri | 268 test, TypeScript, tam ESLint geçti | yalnız destructive policy açık; UI/build/browser yok | C03 non-destructive bridge.
- C03 | 2026-10-03 | composer controller/UI/styles/route/testler, studio bridge, `/pages`, Studio composer smoke | 286 unit, TypeScript, full lint/build, yeni 13 grup smoke ve mevcut Studio smoke geçti | blank canvas, frame/DnD/export yok; provisional deletion guard | C04.
- C04 | 2026-10-03 | composer canvas/frame/camera/gesture/inspector/controller ve smoke | 296 unit, TypeScript/lint/build, 19 grup composer smoke ve mevcut Studio smoke geçti | inert/clipped preview, touch/node selection/insertion yok | C05.
- C05 | 2026-10-03 | page-document registry/default/render/validator/testler, composer insertion, full Container, source consumer ve docs/page-document | 307 unit, TypeScript/lint/build, source browser ve tüm smoke geçti | icons/callbacks/state binding ve insertion UI yok | C06.
- C06 | 2026-10-03 | composer selection/overlay/inspector/controller/frame/gesture/test ve Studio smoke | 313 unit, TypeScript/lint/build, 28 grup composer smoke ve Studio smoke geçti | palette/DnD yok; Preview controlled snapshot | C07.
- C07 | 2026-10-03 | composer insert palette/pointer motor/drop-target/cache/controller/frame/CSS/test ve smoke | 326 unit, TypeScript/lint/build, 34 composer smoke ve Studio/demo regression geçti | mouse insertion; touch/mevcut-node move yok | C08.
- C08 | 2026-10-03 | movement/proposal/controller/commands/node drag/targets/keyboardMove/test ve smoke | 341 unit, TypeScript/lint/build, 43 composer grup ve Studio/demo regression geçti | mouse-only, same-page, collision rejects; combined regression timeout sonrası demo ayrı geçti | C09.
- C09 | 2026-10-03 | component-actions/context-actions/shortcuts/controller/menus/gesture ve smoke | 349 unit, TypeScript/lint/build, son 56 composer grup ve Studio/demo regression geçti | CDP held-button harness düzeltildi; touch/manual kabul açık | C10.
- Görev kaydı biçimi: `Cxx | tarih | değişen dosyalar | komut ve sonuç | sınırlamalar | sonraki görev`.
