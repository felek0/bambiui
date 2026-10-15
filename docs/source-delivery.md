# bambiui · kaynak teslimatı sözleşmesi

Tarih: 2026-10-14 · D01/D02 ZIP sözleşmesi · Format: `bambiui.source-delivery` v1.

**2026-10-15 teslimat kararı:** Ana developer akışı [CLI + statik registry](cli-registry.md) oldu; hedef paket `bambiui@0.2.0`. Bu belge manual ZIP fallback'ini ve önceki D01/D02 kanıtını anlatır. D03 frame ZIP bekletildi. CLI source closure'ı gerçek bağımlılıklara göre kurar; populated ZIP örneğinin Button/Text ihtiyacını komponent bağımlılığı diye taşımaz. Tema dosyaları her iki yolda ortak `source-theme.ts` motorundan gelir.

**Durum:** D02 System kaynak paketi uygulandı: System/Develop `Manual source ZIP (fallback)` seçili komponenti veya yedi komponenti ZIP olarak indirir; browser-safe assembler, build-time catalog, strict System manifesti ve scoped tema aşağıdaki sözleşmeyi kullanır. D03 seçili frame paketi ve D04 temiz kurulum kabulü henüz uygulanmadı. `scripts/page-source-files.mjs` ayrı build-time page prototipidir ve eski çıktı profilini korur; yeni System ZIP ile aynı Node source collector'ını paylaşır. [Roadmap](roadmap.md) iş sırasını, [component API](component-api.md) ve [PageDocument](page-document.md) render/veri sınırlarını belirler.

## 1. Teslim edilen şey

İlk teslimat, geliştiricinin mevcut **React + TypeScript + CSS Modules** uygulamasına kopyaladığı bir kaynak klasörüdür:

- System paketi: seçilen built-in komponentler, gerekli yerel kaynak bağımlılıkları, gerçek component CSS ve tam Light/Dark sistem snapshot'ı.
- Frame paketi: tek seçili frame'in içerik/layout ağacı, ihtiyaç duyduğu komponent/layout kaynakları ve projenin bağlı olduğu sistemin aynı anda yakalanmış snapshot'ı.
- npm paketi, registry/CLI, çalışır bir tam uygulama, backend/form binding veya bambiui ile canlı güncelleme bağlantısı değildir.
- Kod paketi bir Project yedeği değildir. Çoklu sayfalar/frame konumları/assets ve portable Project import B01–B03'e aittir.
- `DesignSystem.version: 3`, kaynak formatının `version: 1` değeri ve host bağımlılık sürümleri birbirinden ayrıdır. Bir sistem release/version-pin özelliği teslim edilmiş sayılmaz.

## 2. Arşiv kararı

**İlk yöntem: tarayıcıda oluşturulan ZIP, STORE yöntemi (sıkıştırmasız).**

Gerekçe: eldeki kaynaklar küçük metin dosyalarıdır; ZIP'in önceliği sıkıştırma değil tek indirmeyle dizin yapısını korumaktır. D01 ölçümünde account-settings prototipi 23 dosya / 252.166 UTF-8 byte; yedi komponentli design-safe prototipi 27 dosya / 259.497 byte üretiyor. Bunlar yeni paketin boyutu değil, yöntemi seçmek için mevcut kaynak tabanının ölçümüdür.

- Yeni runtime bağımlılığı veya server endpoint gerektirmez. D02'de küçük, ayrı bir saf ZIP writer; UTF-8 dosya adları, CRC32, local header, central directory ve EOCD ile uygulanır/test edilir. Genel ZIP parser veya sıkıştırma algoritması yazılmaz.
- İlk sürüm ZIP64, encryption, symlink, binary asset ve arşiv import'u desteklemez. CRC32 bozulma kontrolüdür; imza, güvenilirlik veya yetki kanıtı değildir.
- Sabit üst klasör `bambiui-source/`; indirme adları `bambiui-system-source.zip` ve `bambiui-frame-source.zip`. Kullanıcı sistem/proje/frame adları dosya yolu olarak kullanılmaz; yalnız doğrulanmış JSON/README içeriğidir.
- Yollar forward slash, göreli ve allowlist'lidir. Mutlak yol, `..`, boş segment, NUL, backslash, duplicate/case-fold çakışması ve kökün dışına kaçan yerel import reddedilir.
- Başlangıç teknik sınırı önerisi: en fazla 128 dosya ve toplam 5 MiB UTF-8 payload. Bu yalnız kaynak arşivi sınırıdır; mevcut Project veya 1 MiB PageBundle limitini değiştirmez. Limit aşımı açık hata verir, dosya atlayarak eksik paket üretmez. D02 testleri kesin byte/file sınırlarını ve Unicode metni kapsar.
- Dosya sırası leksikografik, ZIP header zamanı sabit ve içerik aynı snapshot için deterministiktir. Kimlikler/timestamp'lar component CSS veya örnek kullanımına rastgele değer eklemez.
- Blob URL oluşturulur, gerçek download başlatılır, sonra uygun zamanda revoke edilir. Hata veya iptal kayıt/history oluşturmaz. Büyük payload oluşturmayı input/pointermove yoluna bağlama.

Bir sonraki sürümde sıkıştırma gerekirse ölçümle gerekçelendirilir; standart ZIP kitaplığı kullanılması ayrıca değerlendirilebilir. Bu seçim bambiui'nin public lisansını belirlemez.

## 3. Hedef dosya düzeni

```text
bambiui-source/
  README.md
  package.json
  manifest.json
  styles.css
  theme.css
  scope.module.css
  ThemeScope.tsx
  css-modules.d.ts
  snapshots/
    system.json
  ui/
    index.ts
    components/
      index.ts
      components.module.css
      ... seçilen komponentlerin ve bağımlılıklarının kaynakları
    layout/
      index.tsx
      layout.module.css
    cx.ts
    ... kaynak bağımlılık zincirinin gerektirdiği diğer yerel dosyalar
```

| Dosya/grup | Kural |
| --- | --- |
| `ui/components/index.ts` | Yalnız seçilmiş/kullanılan public komponentleri dışa açar; internal yardımcıları public API diye sunmaz. |
| Component kaynakları | `app/studio/components/` içindeki gerçek kaynaklar ve dependency closure; client directive/API/stil consumer değiştirilmeden kopyalanır. `appearance.ts`, `recipe-runtime.ts`, `recipes.ts`, `types.ts`, Field/Spinner gibi yardımcılar gerektiğinde dahil edilir. |
| `ui/layout/` | Frame ağacı veya örnek gerçekten kullanıyorsa dahil edilir. Layout dosyasının içindeki gerekli appearance/cx/CSS kaynakları da toplanır. |
| `ui/index.ts` | Kopyalanan public komponent/layout export'ları. Seçilmemiş public komponentler internal bağımlılık nedeniyle kopyalansa bile otomatik export edilmez. |
| `theme.css` | Tam iki tema; base/variant/state, exact recipes, shared part styles, typography, spacing, derived/system variables ve sparse theme resets. Yalnız explicit scoped selector'lar; `:root` yok. |
| `styles.css` | `theme.css` için giriş dosyası; component CSS Modules kaynak import'ları üzerinden yüklenir. Google font `@import` varsa theme dosyasındaki selector'lardan önce kalır. |
| `scope.module.css` | Yalnız exported theme wrapper baseline'ı: font/ink/surface, color-scheme ve mevcut component contract'ın ihtiyaç duyduğu scoped sr-only/reset. Canvas görünümü yok. |
| `ThemeScope.tsx` | `mode="light" | "dark"` alan, children'ı saran basit `div`; snapshot'a ait scope ID'yi taşır. State/provider/storage/network API yok. `styles.css` host tarafından açıkça yüklenir. |
| `css-modules.d.ts` | Host ihtiyaç duyuyorsa eklenen ambient CSS Module tanımı; mevcut Next/Vite tipleriyle duplicate tanım oluşturacak şekilde zorla host'a eklenmez. README bunu açıklar. |
| `snapshots/system.json` | Tam doğrulanmış DesignSystem v3; componentDefaults, shared styles, exact recipes ve iki tema korunur. Örnekte seed edilen props ile sistem snapshot'ı aynı anda alınır. |
| `package.json` | Dependency bilgisi; `private: true`, ESM. Publish/install/lifecycle script'i ve sahte lisans alanı yok. Host package.json'ını değiştiren komut çalıştırılmaz. |
| `README.md` | Gerçek included dosya/komponent listesi, kurulum, tema kullanımı, state/form ve lisans/network sınırları. Genel placeholder README değil. |

Bu düzen component kaynaklarının göreli import zincirini `ui/` altında korur. Üretilen giriş dosyaları fixed safe isimler kullanır; import yolları kullanıcı metninden türetilmez.

### System paketinin ek dosyası

- `Example.tsx`: seçilen komponentleri tam birer React kullanım örneğinde gösterir; `ThemeScope` kullanır. D02'de `ExampleContent.tsx` doğrulanmış populated PageDocument ağacını mevcut `exportPageTSX` ile üretir; default export'u yerel `ExampleContent` adıyla import edilir. Tam genişlik Container + column Stack örnek layout'udur, wrapper'a canvas ölçüsü eklenmez.
- İçerik/props System Parameters snapshot'ından seed edilebilir, ancak component kaynaklarının React API defaultları yeniden yazılmaz. Size/variant/state örneği hangi değerleri açıkça verdiğini belli eder.
- Card örneğinin nested Text/Button'u varsa onların kaynakları dahil edilir; kaynak manifestinde `requestedComponents` ile `includedComponents` ayrılır.
- Tek Text örneği için tüm interactive kütüphane zorla paketlenmez. Button loading ve field controlled state uygulama callback'i değildir; davranış örnekleri ayrı host integration rehberinde anlatılır.
- `Example.tsx` içinde istenmeyen form action veya otomatik ağ isteği yok.

### Frame paketinin ek dosyaları

- `FrameContent.tsx`: mevcut `exportPageTSX` motoruyla doğrulanmış PageDocument ağacını üretir; exported function/giriş adı sabit ve güvenlidir. Ürün exporter'ında güvenli adlandırma D03'te uygulanır; prototip `PageContent` adını hâlâ kullanır.
- `Frame.tsx`: `ThemeScope` + `FrameContent`; yeni `main` landmark, sabit height, min-height:100vh, ek padding/gap veya canvas clipping eklemez. Semantik landmark'ı host seçer.
- `snapshots/page.json`: `composerFrameToPageDocument` çıktısı; diğer frame'ler dahil değil.
- `snapshots/page.bambiui.json`: aynı PageDocument ve sistemden mevcut `bambiui.page-bundle` v1; kullanıcı bunun tüm Project import formatı olduğunu sanmamalı. Mevcut 1 MiB UTF-8 bundle sınırı korunur; aşarsa paket fail eder.
- Frame x/y, preset/device id, camera zoom, canvas width/height clipping, hover/selection overlay ve inspector/preview session verisi TSX/CSS'ye girmez. Tree içindeki explicit root `appearance.height/width` ise authored içerik stilidir ve korunur; frame geometri metadata'sıyla karıştırılmaz.
- Mevcut component anatomy/state markers ve registry'nin `data-page-node` kimlikleri korunabilir; bunlar render/export eşitliği için kullanılan attributes'tur, canvas selection overlay veya transient state değildir. Bunları kaldırmak ayrı API/parity işidir.
- Bağımsız frame'lerden otomatik tek responsive ağaç veya router üretilmez. Grid'in mevcut intrinsic/container eşiği korunur; responsive mapping teslim edildi iddiası yok.

## 4. Manifest sözleşmesi

`manifest.json` opaque import komutu değil, strict metadata'dır. D02/D03 parser/factory testleri unknown keys ve geçersiz değerleri reddeder. Format 1 aşağıdaki alanları içerir:

| Alan | İçerik |
| --- | --- |
| `format` / `version` | Literal `bambiui.source-delivery` / `1` |
| `kind` | `system` veya `frame`; ayrı şema branch'i |
| `generator` | `{ name: "bambiui", version }`; ürün package.json/build bilgisinden, uydurulmuş release değil |
| `snapshot` | `{ systemSchemaVersion: 3, systemSha256, scopeId }`; exact export snapshot'ını tanımlar |
| `requestedComponents` | System'de nonempty seçili allowlist IDs; Frame'de ağacın doğrudan kullandığı IDs; sıralı/unique |
| `includedComponents` | Aynı ID allowlist'i, closure/example ihtiyaçlarını da kapsar; sıralı/unique |
| `includesLayout` | Boolean, gerçekten paketlenen kaynaklar ile uyumlu |
| `entry` | System için `Example.tsx`, Frame için `Frame.tsx` |
| `dependencies` / `peerDependencies` | `package.json` ile aynı package/version kayıtları; yalnız izinli external bağımlılıklar |
| `files` | Payload dosyalarının sıralı `{ path, bytes, sha256 }` listesi; `manifest.json` kendisini listelemez, self-hash döngüsü yok |
| `warnings` | Typed, stable codes: `remote-font`, `controlled-snapshot`, `form-action`, `explicit-local-styles`, `licensing-unresolved`; ilgili kaynak verisine göre eklenir, token contrast uygunluğu vaadi yok |
| `frame` | Yalnız kind=frame: `{ pageDocumentVersion: 1, frameName }`; name doğrulanmış içerik, dosya/import adı değil |

- `systemSha256`, format validator'ın ürettiği deterministic JSON serialization'ın UTF-8 byte'larından hesaplanır; UI'nin computed CSS ölçümleri kullanılmaz. Hash identity/integrity içindir, imza/release/dosyayı güvenilir yapan bir şey değildir.
- `scopeId = "bambiui-" + systemSha256`; kullanıcı adı/ID'si CSS selector'a interpolate edilmez. Aynı snapshot aynı scope'u, farklı snapshot farklı scope'u alır. İki paketin stilleri import sırasına göre birbirini renklendirmemeli.
- Browser hashing `crypto.subtle` ile; consumer'ın runtime'ında hashing veya bambiui store çözümü yok. Export environment bunu desteklemiyorsa açık hata ver, sessizce global tema üretme.
- ZIP CRC ile manifest SHA-256 farklı amaçlara sahiptir. Tüm arşiv zip-import/export güvenliği çözülmüş diye sunulmaz.
- Dosya/hash listesi tutarlı snapshot'tan üretilir. Kaynak arşivi bir sistem güncelleme/merge talimatı değildir.

## 5. Tema ve host CSS izolasyonu

Paket `:root` veya `body`yi boyamaz. İki tema selector'ı tam scope'u hedefler:

```text
[data-bambiui-system="<snapshot scopeId>"][data-ds-theme="light"]
[data-bambiui-system="<snapshot scopeId>"][data-ds-theme="dark"]
```

`<snapshot scopeId>` burada sözleşme gösterimidir, literal üretilen CSS değildir. İki wrapper bir uygulamada farklı sistem snapshot'larını yan yana taşıyabilir. Nested Light/Dark scope'unda sparse variables `initial` resetleri korunur; outer theme'nin override'ı içeri sızmaz.

- Global token export'unun mevcut `exportCSS()` davranışı geriye uyumlu kalır. Scoped source CSS D02'de aynı token resolver/map üzerinden üretilir; ikinci renk hesaplama motoru veya keyfi CSS metni regex rewrite'ı eklenmez.
- Scope baseline kendi `div` elementinde font family, foreground/background ve color-scheme sağlar; element/genişlik/yükseklik/spacing üzerinde sessiz geometri eklemez. Native buton/input için gereken reset scoped ve mevcut consumer baseline ile testli olmalı.
- Component CSS Modules olduğu gibi kalır. Statik download consumer'da Tailwind zorunluluğu yok. Native text/heading marginleri için gerekli baseline canvas reset'inden körlemesine kopyalanmaz; renderer/consumer karşılaştırmasıyla doğrulanır.
- Google preset seçiliyse tek izinli dış font import'u korunur ve `remote-font` uyarısı çıkar. Kurulumdan sonra consumer'ın Google'a IP vb. request verisi gönderebileceği/offline fallback açıkça yazılır. Font dosyaları indirilip ZIP'e konmaz; self-host lisans/varlık işi ayrı kapsamdır.
- Yeni dialog/popover gibi portaled tüketici eklenirse portal container/theme scope eşlemesi ayrıca test edilir. Bugünkü yedi komponent paketi bütün gelecekteki portal temalarını çözmüş sayılmaz.

## 6. React / Next entegrasyonu

Hedef, host'un React/TypeScript/CSS Modules desteğidir; bambiui host uygulamasını scaffold veya overwrite etmez. Kurulum **host uygulamanın kökünde** yapılır; arşivin içindeki package.json ayrı publishable paket değildir.

D01'de doğrulanan installed baseline: React/react-dom `19.2.8`, `@base-ui/react` `1.8.0`. İlk delivery manifesti test edilen sürümleri kaydeder; sonraki build'ler gerçek doğrulanmış sürümü kullanır, belgeye sabitlenmiş eski sayıları varsaymaz. Mevcut prototipin Base UI range'i `^1.8.0` olup yeni delivery v1 için exact test edilen sürüm tercih edilir. Host React sürümünü sessizce yükseltme; uyumsuzsa açıklayıcı kurulum notu göster.

- React ve react-dom peer dependency; interactive kaynak closure'ında gerekiyorsa `@base-ui/react` dependency.
- Yalnız Text/layout gibi Base UI kullanmayan subset onu yüklemek zorunda değildir. Closure scan bunu belirler; static component CSS içinde interactive selector bulunması dependency gerektirmez.
- `next`, Tailwind, sugar-high, TypeScript AST, `node:fs`/`node:path` veya Studio store/inspector/camera bağımlılıkları exported runtime'a girmez.
- TypeScript, `@types/react`, `@types/react-dom` host geliştirme bağımlılıklarıdır; kaynak dağıtımının runtime dependency listesine yazılmaz.

### System kullanım şekli (D02 uygulandı)

```tsx
import "./bambiui-source/styles.css";
import { ThemeScope } from "./bambiui-source/ThemeScope";
import { Button } from "./bambiui-source/ui";

export default function Example() {
  return (
    <ThemeScope mode="light">
      <Button variant="primary" size="md">Continue</Button>
    </ThemeScope>
  );
}
```

Bu örnekte Button pakete dahil edilmiş olmalıdır. Import yolları indirilen System arşivinin düzenidir, Studio'nun kendi import alias'ı değildir. Uygulama davranışı (`onClick`, kontrollü form state'i) host geliştiricisinin kodunda bağlanır.

### Önerilen frame kullanım şekli (D03 hedefi)

```tsx
import "./bambiui-source/styles.css";
import Frame from "./bambiui-source/Frame";

export default function Screen() {
  return <Frame mode="dark" />;
}
```

Next App Router'da stylesheet app layout/page/component tarafından import edilebilir; host mevcut html/body ve Base UI için isolated root yapısını korur. Delivered component client boundaries aynen taşınır. Host event handler/hook ekleyecekse kendi Client Component boundary'sini oluşturur; exporter bütün paketi gereksizce `use client` yapmaz. Next CSS'in route geçişlerinde unload edileceğine güvenilmez; snapshot scope izolasyonu bu yüzden zorunludur. Bunlar installed Next `05-server-and-client-components.md` ve `11-css.md` rehberleriyle kontrol edilmiştir; fresh install/browser parity kabulü D04'tedir.

## 7. Props, içerik ve uygulama davranışı

- `value`/`checked` controlled snapshot'ları aynı kalır; exporter callback uydurmaz, otomatik defaultValue/defaultChecked dönüşümü yapmaz. Host state bağlanmadan bu kontrollerin editable olacağı vaat edilmez.
- Default props/state ve `appearance`/`parts` değerleri parser/registry'den aynen gelir. Eski local styles System defaultlarını maskeleyebilir; paket bu override'ları kendiliğinden temizlemez.
- Frame form `action`/GET method ve submit button semantiği korunur; kullanıcıya gerçek network/navigation davranışı olabileceği `form-action` uyarısıyla gösterilir. Studio preview'un submit blocker'ı runtime'a kopyalanmaz. Submit'i güvenli şekilde bağlamak host'un sorumluluğudur.
- System Parameters yalnız örnek/seed verisidir, component kaynak API defaults'ı değildir. JSON snapshot parametreleri korur; consumer component her render'da bu JSON'u yükleyip eski instance içeriklerini yeniden yazmaz.
- Input/Switch/Checkbox label, description, error bağlantıları, error position/icon, loading focus, dekoratif ikonlar ve focus outlines gerçek public komponentlerin davranışıdır; exporter bunları generic HTML ile yeniden kurmaz.
- JSON stringleri TSX'te mevcut güvenli stringify yoluyla escape edilir. Kullanıcı girdisinden executable JS, script, dosya yolu veya dinamik import üretilmez.

## 8. Statik/browser-safe teslimat mimarisi

1. **Build time:** mevcut collector'ın AST/local import çözümlemesiyle authoritative kaynak catalog'u üret. Allowlist closure, content, dış bağımlılıklar ve hash/size kayıtları içerir. Input kullanıcı JSON'u değildir; repo source'udur.
2. **Download time:** System seçimi veya Project'in linked system + selected frame'i tek bir detached validated snapshot olarak yakala. Export bitene kadar bu snapshot'ı kullan; UI editleri/tema/system switch sırasında live store'u tekrar okuma.
3. Saf browser assembler: ilgili catalog subset'i, scoped theme CSS, generated entry/example, snapshots, manifest/package/README'yi `Map<relativePath, UTF8 text>` olarak oluştur. Frame markup mevcut PageDocument exporter'ı üzerinden gelir.
4. Saf ZIP STORE writer → Blob → explicit download. Başarı/hata bildirimi UI state'idir; token/project storage ve Undo'ya dokunmaz.

Manifest/catalog üretimi `next build` öncesinde yeniden çalışır; obsolete public artifact ile yeni komponent kaynakları karıştırılmaz. D02 `npm run dev/build` öncesi generator, immutable hash URL'si, küçük generated metadata descriptor'ı ve freshness testi ekledi. Dev oturumunda repo component kaynakları değişirse `npm run source:catalog` + reload gerekir; bu repo edit akışıdır, kullanıcı token değişimleri catalog rebuild istemez. Büyük catalog yalnız export akışı açıldığında yüklenir; canvas açılış JS bundle'ına source text/TypeScript parser gömülmez. Runtime fetch yalnız aynı statik uygulamanın generated catalog'unu ister; snapshot veya kullanıcı metni sunucuya gönderilmez. Henüz yüklenmemiş catalog offline ise açıklayıcı hata gösterilir; tam PWA/offline cache garantisi bu dilim değildir.

`createPageSourceFiles()` bugünkü Node script'i browser component'inden import edilmez. Ortak pure resolver/serializer mümkün olduğunca ayrılır; Node collector ve browser assembler aynı formatı doğrular. Aynı sorgu için iki farklı component dependency grafiği elle tutulmaz.

## 9. Prototipten uygulanacak değişiklikler

| Bugün | D02/D03 hedefi |
| --- | --- |
| Node `createPageSourceFiles(bundle)` | Build-time catalog + browser-safe pure assembler; prototip/test yolu korunur |
| Sadece PageBundle profili | System ve frame branch'leri; ortak kaynak/ZIP sözleşmesi |
| Global `:root` token CSS | Source paketinde snapshot-scoped iki tema; mevcut normal CSS export'u değişmez |
| `Page.tsx` + global `page.css`, ek padding/min-height | `ThemeScope` + scoped baseline; frame'e ek geometri yok |
| Build-time Map, indirme yok | UI → snapshot → doğrulanmış ZIP download |
| Tek installed node_modules consumer | D04 clean install + gerçek browser/DOM/CSS karşılaştırması |
| Plain systemId veya bütün proje backup beklentisi | Paket detached snapshot; full Project backup ayrı B01–B03 |

Bugünkü prototipi bu belgede tamamlandı diye yeniden etiketleme; yeni hedef dosya isimleri mevcut tests/scripts ile uyumlu bir adapter üzerinden eklenmeli.

## 10. Kabul kapıları ve lisans

D02/D03 için zorunlu testler:

- System subset ve all-seven; minimal Text; Card example dependency closure; frame layout/parts/recipes/sparse Dark reset.
- Deterministic manifest/file list/hash/UTF-8, path traversal ve duplicate path rejection, unsupported dependency/format/size limit.
- Standard ZIP reader ile gerçek dosya açma ve payload/CRC eşitliği; Unicode içerik, empty text file, exact limit. Browser gerçek download ve Blob URL cleanup.
- Export sırasında system/frame/theme değişimi tek snapshot'ı bozmaz; selection/history/storage write sıfır; missing linked system fail eder, fallback yok.
- İki farklı sistem CSS'inin aynı host'ta izole olması; nested Light/Dark; native focus/disabled/loading/error/readonly; native browser reflow.
- Canvas overlay/geometry/transient preview kodu exported kaynaklarda bulunmaz; component anatomy markers ve gerekli CSS korunur.
- D04 ayrı React/Next clean dependency install, TypeScript/build/hydration, form/state boundary ve rendered CSS kabulünü kapatır. Existing shared node_modules fixture bunu tek başına kanıtlamaz.

**Lisans kararı · 2026-10-15:** Kullanıcı CLI ve dağıtılan yazılım kaynakları için MIT'yi onayladı. [Kapsam](licensing.md) ve `distribution-license.json` yalnız CLI/gerekli ortak dosyaları lisanslar; Studio'nun tamamını değil. Kaynak graph'ı allowlist ile doğrulanır; paketler LICENSE/NOTICE taşır. Yeni arşivlerde `licensing-unresolved` üretilmez; eski manifestleri okumak için warning code hâlâ kabul edilir. User-authored data, marka ve üçüncü taraf/font hakları ayrıdır; `private: true` paketleme metadata'sıdır, lisans yerine geçmez.

### D02 kanıtı · 2026-10-15

- `source-collector.mjs` prototype/catalog için tek Node import grafiğidir; gerçek component/layout kaynakları değiştirilmeden taşınır. Kaynak catalog'u 208.563 UTF-8 byte; public artifact Git'e eklenmez, küçük descriptor build'in hash/URL/size değerlerini tutar.
- `source-delivery.ts`, `source-catalog.ts`, `source-manifest.ts`, `source-files.ts` ve `source-zip.ts` saf assembly/validation/hash/ZIP sınırlarını ayırır. İki tema aynı token resolver'dan explicit scope selector'larıyla üretilir; normal global CSS export'u değişmedi. Scope native-control baseline'ı sıfır specificity kullanır; component font stillerini ezmez.
- `source-download-panel.tsx` yalnız seçili/tüm komponent aksiyonları ve inline busy/status/error sunar. Ready olmayan store'dan indirme yok; snapshot lazy import/fetch öncesi yakalanır. `source-download.ts` bounded same-origin fetch, build hash doğrulaması, gerçek Blob/link download ve gecikmeli URL cleanup yapar. Storage/history callback'i yok.
- 581 unit/SSR/source testi geçti; bunların 15'i yeni kaynak testleri. Python standard ZIP reader payload/STORE/header/CRC, Unicode/empty content, corruption ve exact file/byte limitlerini doğruladı. Catalog/manifest strict keys, hash/paths/dependencies, deterministic bytes, snapshot capture, remote font/controlled props ve download cleanup/error test edildi. Python yalnız test bağımlılığıdır.
- `node scripts/check-system-source.mjs --browser`: all-seven/ikinci sistem/minimal Text kaynakları standalone React tip kontrolünden geçti; ayrı Next build/prerender ve browser hydration, body/root/two-system/nested Light/Dark izolasyonu, kesirli exact typography, readonly/error/disabled/loading, native choice toggle ve 1440/768/390 scope geometry kontrolleri geçti. Kurulu node_modules kullanıldı; D04 fresh install/full visual parity kabulü değildir.
- `node scripts/studio-source-smoke.mjs --screenshots`: gerçek trusted-pointer Card/tüm yedi/Text ZIP indirmeleri, fetch sırasında selection navigation, storage no-op, unavailable catalog error/retry ve 390px reflow geçti. Mobil screenshot incelendi.
- Son kontrolde metadata mtime'ı eski `out/` çıktısından yeni olduğu için workspace preflight doğru şekilde reddetti. Generator artık içerik aynıysa descriptor/catalog dosyasını yeniden yazmaz; no-op timestamp regresyon testi eklendi. Güncel production build sonrasında catalog freshness, TypeScript, lint ve 97 System kontrolü temiz exit ile geçti. Source-download script'i de temiz çıktı. Workspace script'i son çalıştırmada 23 senaryo ve cleanup başarısını logladı, fakat terminal komutu süreç kapanışında 240 saniyelik timeout aldı; temiz workspace process-exit kabulü yeniden açık. D02'nin önceki çalıştırmasındaki temiz exit bu son turun yerine kullanılmaz. Ayrı composer drag ve eski page-consumer browser script'i bu turda yeniden çalıştırılmadı. Manual VoiceOver/native zoom/cross-browser ve public lisans kapıları açık.

### D01 kanıtı (sözleşme turunun tarihsel kaydı)

- Mevcut collector/exporter/bundle/registry, gerçek component/layout import zinciri ve installed Next rehberleri incelendi.
- `npm ls react react-dom @base-ui/react --depth=0`: React/react-dom 19.2.8, Base UI 1.8.0.
- `node --test app/studio/page-document/source.test.mjs app/studio/page-document/bundle.test.mjs`: 11 test geçti; bunlar mevcut prototip ve bundle için, yeni ZIP/browser assembler için değildir.
- Prototip file-count/byte/dependency closure ölçümü yapıldı; yukarıdaki boyutlar bu ölçümden gelir.
- `node scripts/check-page-source.mjs --browser`: mevcut exported kaynaklar React olarak tip kontrolünden geçti; bağımsız Next consumer production build/prerender ve Light/Dark browser CSS, responsive geometry, native input/validation, Switch, GET FormData, yedi komponent hydration, Checkbox mixed state ve uncontrolled Switch kontrolleri geçti. Komut temiz exit ile tamamlandı. Kurulu `node_modules` tekrar kullanıldı; fresh install veya yeni scoped ZIP/browser assembler kabulü değildir.
- D01 yalnız sözleşme/dokümantasyon dilimidir; source runtime ve indirme UI'sı değiştirilmedi. Markdown yerel dosya bağlantıları ve `git --no-pager diff --check` kontrolü yapıldı. Public lisans ve D02–D04 uygulama/kabul kapıları açık.
