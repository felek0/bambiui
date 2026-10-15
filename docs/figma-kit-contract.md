# bambiui · Figma kit eşleme ve kabul sözleşmesi

Tarih / kaynak erişimi: **2026-10-16** · Görev: **Agent E / SF6.1 araştırma**.

**Durum:** mevcut kaynak üzerinden eşleme araştırması; authoring yapılmadı. Bu belge uygulamanın, SF4/SF5'in veya Figma kit'in tamamlandığı anlamına gelmez. Gerçek `.fig`, Community yayını, Figma dosya/link/node kimliği ve import/duplicate/edit kanıtı yoktur. SF6.2, atanmış sahip/inceleyen ve doğrulanmış authoring erişimi olmadan **blocked** kalır. Pilot kabulü ile yedi komponentlik kit kabulü ayrı kapılardır.

Kapsam kaynağı: [roadmap](roadmap.md#sf6--figma-kit-pilotu-ve-teslimat), [Agent E görevi](system-first-execution-plan.md#7-agent-e--figma-sözleşmesi-şimdilik-araştırmadoküman), `AGENTS.md`. İlk Agent E araştırma turunda yalnız bu yeni dosya yazıldı; o turun kaynak erişimi/kimlik ve kanıt kayıtları aşağıda korunur. Sonraki kullanıcı scope amendment'ı yalnız aktif edit/reset eşlemesini günceller; geçmiş araştırma veya test sonuçları yeniden tarihlenmez. Kit üretimi, plugin/REST implementasyonu, publish/deploy ve otomatik/çift yönlü sync kapsam dışıdır.

## 1. Kanıt sınırı ve doğrulanmış kaynak kimlikleri

Aşağıdaki kimlikler yerel okuma ve bellekte hash hesabıyla doğrulandı; production endpoint/npm bu görevde yeniden sorgulanmadı. Başlangıç çalışma ağacında başka işlere ait doküman değişiklikleri vardı; korunmuştur. HEAD tek başına uncommitted çalışma ağacını tanımlamaz.

| Kimlik | 2026-10-16 gözlemi | Anlam / sınır |
| --- | --- | --- |
| Git HEAD | `38d88b836dc520be4e6f0e9be1ad8a3ac75fc457` | Araştırmanın kod referansı; final SF4 freeze değildir. |
| Source catalog SHA-256 | `1a96040c60dec1e9bf59499d0817456f58afb3a5d84774445ec5cfc92258a5ba` | 208563 UTF-8 byte. `createSourceCatalog()` + `canonicalJSON()` ile yeniden hesaplandı; `app/studio/source-catalog-meta.json` ve arşiv registry'nin iç kataloğuyla eşleşti. |
| Registry release SHA-256 | `f8c9659b67ea08923f7300577db326c63baa61cad3b04e9576ae0b10c945a709` | 210376 byte; `registry/releases/<hash>/registry.json` ham byte'larından hesaplandı; `registry/releases.json` ile eşleşti. |
| Registry tema runtime fingerprint | `fe6c8ea9554077cc4f3ab3243b8d121b521e445ddc633e4e9f2adc97d8842ba7` | Arşivdeki `themeRuntimeSha256` alanından okundu; bu tur compiled runtime yeniden build edilmedi. |
| Araştırma default System snapshot SHA-256 | `3655e4cb1951f9f99c443d2e52f3ad98413a0a6ac69e905751fbdd8014338e34` | 5481 byte; `canonicalJSON(parseDesignSystem(JSON.stringify(defaultSystem)))` byte'larının hash'i. Schema v3, iki tema, `Untitled system`; kullanıcı verisi veya üretilmiş Figma dosyası değildir. |
| CLI / uygulama / format | Roadmap'te CLI `0.2.1`; root private package `0.1.0`; System schema `3`; source catalog/registry format `1` | Bunlar farklı sürüm eksenleri; CLI semver kit sürümü değildir. Bu tur public npm sürümü yeniden doğrulanmadı. |
| Generated public dosyalar | `public/registry` ve `public/bambiui-source` okuma sırasında boştu | Metadata/arşiv doğrulaması yapıldı; burada çalışan download endpoint'i veya build freshness geçti denmez. |

Snapshot yeniden üretimi dosya yazmadan yapılabilir: `defaultSystem`, `parseDesignSystem` (`app/studio/tokens.ts`), `canonicalJSON` (`app/studio/source-files.ts`) ve Node `createHash("sha256")` kullanılır. JSON boşluk/sıra farkı ham hash'i değiştirir; kimlikte yukarıdaki canonical serialization açıkça belirtilmelidir. Pilotun düzenlenmiş snapshot'ı ayrıca yakalanıp hash'lenir; bu default hash'in üzerine aynı isimle geçirilmez.

### Okunan gerçek kaynaklar

- API ve varsayılanlar: [component-api.md](component-api.md), `app/studio/components/{button,input,switch,checkbox,badge,card,text}.tsx`, `components/field.tsx` ve `components/appearance.ts`.
- Exact katalog/anatomy/target: `components/recipes.ts`; doğrulama, normalize ve değişken adları: `app/studio/component-recipes.ts`. `recipe` bir React prop'u değildir.
- Shared part allowlist: `app/studio/component-styles.ts`; exact ile aynı alan listesi değildir. Örneğin shared Button/Badge yalnız `root`, exact ise `root,text` içerir.
- Gerçek tüketim/cascade: `components/components.module.css`, `components/recipe-runtime.ts`; token schema, varyant/state kayıtları, tipografi/font ve sabitler: `app/studio/tokens.ts`.
- Kaynak teslimat kimliği: `scripts/generate-source-catalog.mjs`, `scripts/source-collector.mjs`, `app/studio/source-catalog-meta.json`, `registry/releases.json` ve yukarıdaki exact registry byte'ları; bağlam: [cli-registry.md](cli-registry.md).
- Haklar: [licensing.md](licensing.md), `distribution-license.json` kapsamına ilişkin belge. Tüm Studio'nun MIT olduğu sonucu çıkarılmaz.

**Revalidation kapısı:** SF4 sonrası A/koordinatör kabul edilecek kod revizyonunu sabitler; E/kit sahibi API kataloğunu, tüketilen part/field listesini, CSS cascade'ini, catalog/registry hash'lerini ve seçilen System snapshot'ını tekrar eşler. Fark varsa bu belge revize edilmeden pilot parity kabul edilmez. 294 sayısının aynı olması tek başına API veya görsel parity kanıtı değildir.

## Superseding kullanıcı amendment'ı — encoded declaration ve UI write group

**Web editörü amendment'ı uygulandı ve otomatik testlerden geçti; Figma authoring/parity doğrulaması yok.** [SF0 amendment](system-first-sf0-contract.md#superseding-user-amendment--size-based-editor-write-groups) önceki exact-only non-color düzenleme beklentisini geçersiz kılar; schema v3, public API, CSS/resolver/import ve Figma encoded declaration kimlikleri değişmez.

- Bir JSON path / exact recipe / CSS variable / Figma binding satırı hâlâ **tek exact declaration**'ı temsil eder. UI gesture ise bir **write group** olabilir: non-color aynı component + size + part + target için tüm desteklenen variant/state/tone entry'lerine yazılır. Text typographic variant'ı da tutar: `paragraph.sm` altı tone'a yayılır, h1/caption veya başka size'a değil. Bu grup yeni token/variable namespace'i veya runtime inheritance değildir.
- `background`, `color`, `borderColor` yalnız seçili exact recipe/current theme'e yazılır. Non-color iki temada shared kalır. Input error grubu invalid/readonly; choice error grubu yalnız invalidChecked/invalidUnchecked, aynı size ve desteklenen field/target ile sınırlıdır.
- Field reset aynı gruptaki authored alanı kaldırır; mixed target reset her alanı kendi color/non-color scope'uyla ele alır. Her entry kendi fallback'ına döner. Tek `onRecipesChange` tek undo gesture group taşır; Figma undo veya variable binding bununla otomatik senkron değildir.
- Inspector seçili canonical örneğin gerçek değerini ölçer, write scope'u ayrıca etiketler. Inspection peer normalize etmez. Tarihsel divergent exact kayıtlar ilgili edit/reset'e kadar aynen eşlenir; Figma aktarımı bunları tek size variable'a indirgemez. Ayrı All combinations shared bölümü bütün size'ları kapsar.
- Aşağıdaki kaydedilmiş HEAD/hash/byte/snapshot kimlikleri önceki araştırma gözlemidir; değiştirilmez ve yeni ölçüm sayılmaz. UI-only helper sonrası production build/catalog+registry freshness ve CLI testleri source kimliklerini değiştirmedi. Kaydedilmiş araştırma hash'leri yeniden Figma pilot kanıtı yapılmaz. Web tarafındaki 99 System/17 System-only browser kontrolleri edit gruplarını doğrular; gerçek kit/variable binding testi değildir. Version değişikliği veya publish yapılmadı.

## 2. Eşleme dili ve iki ayrı teslimat

Tablolardaki Figma adları **önerilen authoring sözleşmesidir**, mevcut dosyadaki property/variable kimlikleri değildir. Gerçek authoring sırasında node/property/style/variable ID'leriyle bir eşleme kaydı tutulur. Görünür layer adları koddaki küçük harfli part kimliğini korur; UI'da Label yazılması `text` kimliğini `label` yapmaz. Figma'nın property adlarına ekleyebildiği `#…` kimlikleri tam kaydedilir; yalnız görünen isim eşleştirme için yeterli değildir [F2].

| Teslimat | İçerik | Bu turun sonucu / ayrı karar |
| --- | --- | --- |
| Standart starter kit | Sabitlenmiş default System + yedi komponent/foundations, iki tema, örnekler, kullanım/kısıt açıklamaları | Eşleme araştırması. Kit dosyası yok. Kullanıcının özel sistemini içerdiği söylenmez. |
| Kullanıcıya özel System JSON aktarımı | Kullanıcının açıkça seçtiği farklı snapshot'ın temalarını, shared ve exact overrides'ını kit kopyasına uygulama | İlk seçenek aşağıdaki **manuel rehber**; işlemin kendisi yapılmadı. bambiui JSON'u Figma'nın yerleşik import formatı varsayılmaz. |
| Otomatik aktarım | Ayrı plugin veya uygun REST entegrasyonu | SF6.4 kullanıcı onayı, teknik pilot, izin/gizlilik/bütçe kararı bekliyor. Standart kit kabulünün şartı veya mevcut özellik değildir. |

React API defaults, kaydedilmiş `componentDefaults` (insertion props/copy), token/recipe değerleri ve geçici preview state birbirine dönüştürülmez. Kit örnek metni bağımsız içeriktir; insertion default'larını düzenlemek React varsayılanlarını değiştirmez. Geçici preview içerik/state'i snapshot/hash veya kit tema kaynağı sayılmaz. Project/composer authoring bu teslimatla yeniden açılmaz.

## 3. Yedi komponent: API → Figma property / layer / variable / style

Tüm boyut eksenleri `sm | md | lg`, varsayılan `md`; tone yalnız Badge/Text'te `neutral | primary | success | warning | danger | info`. Tüm komponentler typed `appearance` ve uygun native/Base UI props kabul eder. `className`, native `style`, event callback ve `render` gibi kod bileşimleri Figma property olarak çalıştırılmaz; annotation/handoff'tur. İçerik `ReactNode` iken Figma TEXT property yalnız düz metin karşılığıdır; karma içerik nested instance/layer bileşimi gerektirir.

`F` = Frame alanları; `T` = altı tipografi/ink alanı; `I` = yalnız `color`. Bunlar tasarım tarafı target etiketleri; recipe key'e eklenmez.

| Komponent / kaynak | Gerçek API, recipe ve varsayılan | Önerilen Figma property ve layer eşlemesi | Variable/style yolu ve uyumsuzluk |
| --- | --- | --- | --- |
| **Button** · `components/button.tsx` | `variant=primary` (primary/secondary/outline/ghost/destructive/link); `size`; opsiyonel `radius`; disabled/loading/fullWidth/iconOnly/startIcon/endIcon; Base UI `render`, native button props; iconOnly için `aria-label` zorunlu. **18** `variant.size`. | Component set: `variant`, `size`. `children` → `text` layer TEXT; ikonlar için görünürlük + INSTANCE_SWAP önerisi; fullWidth → auto-layout sizing. Exact **root F, text T**. Disabled/loading ve hover/pressed/focus örnekleri recipe dışı durum demonstrasyonudur. | `variantColors.button[variant]` → fill/ink/stroke/effect; exact `componentRecipes.button[key].root/text` → boyuta/part'a özel bağlar. **`icon` exact part yoktur**; spinner/decorativeIcon yeni token katmanı değildir. Loading spinner + erişilebilir busy/focus/activation davranışı Figma'da native karşılık değildir. |
| **Input** · `components/input.tsx`, `field.tsx` | `label` zorunlu; hideLabel/description/error/errorPosition=below/errorIcon=none; size/radius; parts; readOnly/disabled/required; placeholder/name/value/defaultValue/onValueChange; startIcon/endIcon; type=text (email/password/number/search/tel/url da var). **9** `state.size`: default/invalid/readonly. | `state`, `size` variant property; label/value/placeholder/description/error → TEXT; optional mesaj/ikon görünürlüğü, errorPosition ve errorIcon recipe dışı içerik düzeni. Exact **root F; label/control/description/error F+T**. `control` wrapper + input metni aynı part'ın iki target'ıdır. | `variantColors.input` default/**hover**/invalid/readonly; hover token entry vardır ama hover recipe yoktur. `readonly` invalid'den önceliklidir; error layer yalnız invalid/readonly recipe'de erişilebilir. Placeholder rengi global mutedForeground; control ink onu değiştirmez. Figma value bir taslak metindir, native input/validation/password güvenliği veya gerçek form kontrolü değildir. |
| **Switch** · `components/switch.tsx`, `field.tsx` | Labelled choice; size; labelPosition=end; hideLabel/description/error/errorPosition/errorIcon/parts; disabled/readOnly/required/name/value; checked/defaultChecked/onCheckedChange. **Radius prop yok.** **12** `state.size`: checked/unchecked/invalidChecked/invalidUnchecked. | `state`, `size`; labelPosition için recipe dışı düzen; label/description/error TEXT ve visibility. Exact **root/row F; label/description/error F+T; control F+I**. Track/thumb yapısı görünür; thumb exact part değildir. | Dört `variantColors.switch` state'i + exact part bağları; pill default geometri korunur. Shared/local corner edit mümkün olması public radius prop'u var demek değildir. Figma checked prototype görsel durumdur, Base UI controlled/uncontrolled geçiş/required/readOnly/keyboard semantiği değildir. |
| **Checkbox** · `components/checkbox.tsx`, `field.tsx` | Switch vocabulary + opsiyonel `radius`, `indeterminate`; labelPosition=end. **12** aynı state key'leri. | Switch ile aynı exact part/target yapısı. Check/minus layer'ları control'un içindedir; indeterminate için recipe dışı görsel örnek/modifier. | `variantColors.checkbox` dört state; **indeterminate checked recipe kullanır**, 15'inci veya ayrı indeterminate recipe yok. Control T font edit'i değil yalnız ink'tir. Figma seçili görseli native checkbox form değerinin veya erişilebilir mixed-state'in çalıştığı kanıtı değildir. |
| **Badge** · `components/badge.tsx` | `variant=outline`: solid/subtle/outline; tone=neutral; size; radius; dot=false/startIcon; children. **54** `variant.tone.size`. | Component set: variant/tone/size; children TEXT → `text`; dot BOOLEAN görünürlüğü ve ikon swap/visibility. Exact **root F, text T**. | `variantColors.badge[variant.tone]` tüm 18 yüzey çifti için; exact root/text boyut/etiket edit'i. Dot/icon root ink'ini korur, text recipe onları boyamaz. Status dekorasyonu interaktif control veya canlı region ilanı değildir. |
| **Card** · `components/card.tsx` | `variant=outlined`: outlined/elevated/filled; size; opsiyonel radius; native article props; compound `.Icon/.Header/.Title/.Description/.Content/.Footer`, her slot kendi appearance'ını kabul eder. **9** `variant.size`. **Card parts prop'u yok.** | Component set: variant/size; compound hierarchy aşağıdaki Card tablosu. Title/Description düz içerik TEXT; Content/Footer nested instance bileşimi. Exact **root/header F; title/description/content/footer F+T; icon F+I**. Hepsi dış Card key'ine aittir. | `variantColors.card[variant]` ve variant-derived description ink; exact slot overrides. Card'a tone/disabled/loading/as ekseni eklenmez. Card.Title gerçek DOM'da `strong`, otomatik heading değildir. CSS descendant scope ve bağımsız child yüzeyleri Figma'da elle binding gerektirir. |
| **Text** · `components/text.tsx` | `variant=paragraph`: heading/h1–h6/paragraph/label/caption; tone=neutral; size; `as=h1…h6/p/span`; children/native HTML attributes. **180** `variant.tone.size`. | Component set variant/tone/size veya bu coverage'ı açık tutan eşdeğer set; **root F+T** → gerekirse box wrapper + tek text node. On temel text style + size çözümleri; renk tema variables'ından ayrı. `as` annotation'dır, görsel recipe ekseni değildir. | Shared typography variant fontSize/lineHeight/fontWeight/letterSpacing + `--text-foreground`/semantic on-subtle; exact root ve shared root override. h1–h6 varsayılan matching tag, heading→h2, paragraph→p, diğerleri→span; Figma style adı HTML semantiği sağlamaz. Eski Text alias'larının tüketilmeyenleri kit kontrolü olarak sunulmaz. |

**Toplam:** Button 18 + Input 9 + Switch 12 + Checkbox 12 + Badge 54 + Card 9 + Text 180 = **294 exact recipe**. Bunlar Light/Dark ile 588 kontrol edilecek görünüm oluşturur; 588 farklı recipe değildir. Figma modifier örnekleri component sayısını artırabilir fakat web recipe coverage sayısına dahil edilmez. Disabled/loading/radius/as/labelPosition/copy/error presentation yeni exact axis değildir. Optional description/error ve iconOnly nedeniyle bazı katmanların specimen'de bulunmaması kayıp API sanılmaz; erişilebilir katman union'ı ile gerçek recipe anatomisi ayrı tutulur.

### Target ve field sınırları

- **F:** width/height/minWidth/minHeight/maxWidth; bağımsız padding/margin kenarları; dört corner; izin verilen part'larda gap; background/borderColor/borderWidth/shadow/opacity. Button/Badge `text` frame target'ı yoktur. Text root'ta gap yoktur. Tam allowlist `componentRecipeFieldKeys` / `componentRecipeFields(component, part, target, recipe)` ile belirlenir; bütün appearance alanlarını her part'a açma.
- **T:** fontSize/fontWeight/lineHeight/letterSpacing/textAlign/color. **I:** Switch/Checkbox control ve Card icon için yalnız color; font control'leri gösterme. Card root/header text target'ı yoktur.
- Conditional error: Input default ve valid choice checked/unchecked recipe'leri error içermez; invalid choice ve Input invalid/readonly error gösterebilir. Opsiyonel Error'u açmak valid recipe'de aynı key altında hatayı boyamak değildir.
- Hover/active, focus, opacity ve motion örnekleri ayrı bir davranış/specimen sayfasında gösterilebilir; canonical component recipe kataloğuna sessizce katılmaz.

## 4. Token katmanları → variables, styles, auto layout

Figma collections için önerilen isimler: `bambiui/colors` (Light/Dark), `bambiui/shared` (tek shared değer seti). Bunlar henüz oluşturulmamıştır. İki tema modu plan/hesapta kullanılamıyorsa iki açık tema örneği manuel fallback olarak kaydedilebilir; bu fallback, variable-mode parity kabul edildi demek değildir.

| Web veri / tüketim | Önerilen Figma karşılığı | Korunacak sınır / manuel iş |
| --- | --- | --- |
| `themes.light/dark.global`, colorScales, derived role colors | COLOR variables, Light/Dark modes; yüzey/ink/stroke bindings | Renk modları bağımsızdır. Derived değerler mevcut `toCSSVariables(theme, mode)` çözümünden alınır; Figma'da aynı renk algoritması var sayılmaz. Hex/sRGB ve alpha kaydı tutulur. |
| `variantColors` → `--{component}-variant-*` | Component variant/state COLOR bindings; borderWidth shared sayı; shadow effect style | Global semantic renkler yalnız default; Button secondary/destructive, Badge tüm tone/variant çiftleri ve Card yüzeyleri globalden ayrılabilir. Yerel component override'ı global alias'a indirgeme. |
| `componentStyles[component][part]` → `--{component}-part-{part}-{field}` | All-combination shared layer default bindings | Sparse authored alanlar ve effective fallback ayrı açıklanır. Root/control paint alanları burada değil mevcut variant/state layer'ındadır. |
| `componentRecipes[component][exactKey][part]` → `--{component}-recipe-{kebab-key}-{part}-{kebab-field}` | Encoded exact declaration'ın ilgili layer binding'i; örnek öneri: `card/outlined.md/title/fontSize`; non-color UI write group birden çok böyle satıra yazabilir | Noktalı/case-sensitive kod key'i eşleme kaydında aynen korunur. Figma slash adı kod key'i değildir. `--card-recipe-filled-lg-footer-color` gibi CSS adları yalnız CSS için slug'lanır. |
| Global radiusSm/radius/radiusLg, spacingSm/Md/Lg, controlHeightSm/Md/Lg, base component aliases | Shared FLOAT variables; radius props için ayrı açık seçim/manual binding | `radius` legacy medium ve `--ds-radius` compatibility alias; `radiusMd` bağımsız yeni kayıt değildir. Omitted radius eski numeric component radius override'ını korur. Omission'ı zorla md prop'una dönüştürme. |
| Font preset, on Text typography style, size scales | Text styles + desteklenen STRING/FLOAT typography bindings [F1]; shared geometri | CSS font stack bir Figma fontFamily adı değildir. sm=0.875, lg=1.125 ölçekleri mevcut tüketimden çözülür; her alan gelişigüzel ölçeklenmez. |
| Shadow presets, systemConstants, focus/motion | Effect styles ve açıklamalı davranış örnekleri | Değiştirilemeyen sistem sabitlerini editable bambiui token diye sunma. Focus outline decorative border'dan bağımsızdır; `none` shadow focus'u söndürmez. |
| Local appearance / field parts / slot appearance | Figma instance override / bağımsız layer edit'i | Theme-independent yerel renk seçimi global veya exact token değildir; bu kit token audit'inin sertifikası değildir. Raw CSS/callback/URL JSON'a eklenmez. |

### Cascade ve sparse reset

Her property için web sırası: local `appearance` (field `parts.control` primary appearance üstüne) → trusted native `style` → exact recipe → legacy shared part → component variant/state/global/CSS inheritance. Figma variables alias'ları bu cascade'i otomatik çalıştırmaz. Kit sahibi authored değer, effective değer, kaynak/fallback ve binding destination'ı ayrı kaydeder; tek flattened renk sayfasını lossless System dönüşümü diye sunmaz.

Omitted field inherit eder; explicit transparent fill parent'ı gösterir; explicit sıfır omission değildir. Reset authored override'ı kaldırır, bugünkü effective değeri kaydetmez. Figma'da reset, uygun alias/default binding'ini geri kuracak şekilde denenmelidir; salt “remove all overrides” web'deki bir-field reset'in eşdeğeri varsayılmaz. CSS `initial` ile Dark'a Light override sızmasını önleme ayrıntısı Figma'da mode binding doğrulamasıyla karşılanır.

Schema v3 import non-color değerleri **Light'tan, omission dahil** normalize eder; Light/Dark renkleri korunur. Tarihsel kesirler yuvarlanmaz, bilinmeyen key/part/field ve geçersiz değerler reddedilir. Bu sözleşme için yeni schema/token yazılmaz. Generated active-part/min-height/box-sizing/thumb helper'ları kullanıcı token'ı veya ek kit variable kontrolü olarak listelenmez.

### Ölçü, tipografi ve auto layout farkları

- CSS px → Figma design unit karşılaştırması 1:1 logical scale ile yapılır; canvas zoom fiziksel ekran pikseli sanılmaz. Corner smoothing için CSS'e denk olmayan ek smoothing uygulanmaz. Border alignment ve layout'a stroke dahil edilmesi [F2] ile ayarlanıp border-box dış/iç ölçüleri ayrıca ölçülür.
- Kesirler giriş ve readback'te korunur: 19.375, 23.125, 17.25 gibi değerler integer grid'e snap edilmez. FontWeight tamsayıdır; örnek 635 geçerlidir fakat seçilen fontun/renderer'sının bu ağırlığı gerçekten üretebildiği ayrıca doğrulanır.
- CSS lineHeight unitless çarpan; Figma'ya manuel style olarak yüzde `100 × çarpan` veya çözümlenmiş px `fontSize × çarpan` açık birimle aktarılır. Bound typography variable'ın birim/davranışı pilotta ayrıca denenir. LetterSpacing px; em sabitleri resolved font size ile çözülür. Yüzde letter spacing'e sessizce çevrilmez.
- Figma [F1] typography `fontWeight` binding'inde geçerli olmayan değerin en yakın ağırlığa gidebileceğini belirtiyor. [F5] variable font variation axis okumayı/yazmayı belgeliyor. 635 desteği **font ailesi, axis ve gerçek readback ile** gösterilmeden eşdeğerlik iddiası yok; 600/700'e sessiz round kabul edilmez.
- CSS font stack OS/browser'a göre değişir. Default `system` aynı fontun seçileceğini garanti etmez. Pilot önce web'in gerçekten render ettiği aile/yüz/weight'i ve Figma erişimini sabitler. Alternatif ortak font seçilirse ayrı snapshot/hash ile açık karar gerekir; font substitution sayısal tolerans içinde gizlenmez.
- Auto layout padding/gap/align/sizing kısmen doğrudan [F2]; CSS margin (özellikle negatif), margin collapse, `%`/hug/fill/minimumlar, inline strong/text box davranışı birebir değildir. Gereken wrapper veya manuel constraint layer'ı `implementation helper` diye işaretlenir, yeni Card part yapılmaz. Parent bağlamı olmadan fill/hug eşdeğerliği kabul edilmez.
- Text wrap/overflow ve CSS grid'in bütün track davranışları otomatik taşınmaz. Card.Content'in tek kolon akışı auto layout ile temsil edilebilir; grid/resize eşitliği uzun içerik ve dar genişlikte ayrıca ölçülür. Figma'da GRID bulunması CSS grid motoruyla tam eşdeğerlik kanıtı değildir.

## 5. Card pilotu: anatomy ve web ↔ Figma karşılaştırması

**Başlama koşulu:** kullanıcı kit sahibini/tasarımcıyı ve bağımsız inceleyeni atar; edit/duplicate/export erişimi olan gerçek Figma Design oturumu veya onaylı authoring aracı doğrulanır; SF4 sonrası baseline revalidate edilir; font ve aşağıdaki tolerans politikası pilot başlamadan onaylanır. Bu tur bu koşullar sağlanmış sayılmaz.

Önerilen örnek: root → isteğe bağlı icon; header → title + description; content → nested Text; footer → nested Button (ayrıca Badge/Text scope örneği). Bu bir specimen'dir, Card'ın zorunlu çocuk şeması değildir. `Card.Media` mevcut API'de yoktur. İkon kapalı starter varsa ayrı anatomy specimen'iyle icon coverage gösterilir.

| Kod part / gerçek tüketim | Figma layer / karşılaştırma | Kritik izolasyon |
| --- | --- | --- |
| `root` / article, column flex, flex-start; scaled card padding/gap; variant fill/border/shadow | `root` component auto layout vertical; çözümlenmiş ayrı padding ve gap; width/height/minimum/corner/stroke ölçümü | Encoded `outlined.md` root declaration yalnız o recipe'yi çözer; UI non-color edit/reset md root/frame grubundaki üç variant'a yazar, sm/lg'ye taşımaz. Color yalnız selected exact recipe/theme'dedir. Card'da focus/loading/disabled ekseni uydurulmaz. |
| `header` / column, gap=card-gap/2 | `header` vertical auto layout; effective gap ve inherited paint kaydı | Title header ink/surface'i inherit eder; description bağımsız variant-derived ink kullanır. |
| `title` / strong; title weight/letter-spacing constants + exact fields | `title` text; gerekiyorsa F alanları için wrapper; T için text style/binding | Seçili `outlined.md.title` 19.375px/635 UI edit'i üç md Card title/text exact entry'sine yazılır; standalone Text style'ını değiştirmez; strong'u otomatik h2 diye sunma. |
| `description` / p, zero margin, variant-derived ink/line-height | `description` text + gerektiğinde box | Header rengini değiştirmek description ink'ini otomatik aynı renge çevirmemeli; transparent parent'ı göstermeli. |
| `content` / stretch grid; size'a göre spacingSm/Md/Lg (4/8/16px default) | `content` fill-width container; nested Text örneği | Exact content T altı alanı descendant Text ve Button/Badge label'a uygular; child surface bağımsızdır. |
| `footer` / stretch flex wrap center; gap=card-gap | `footer` horizontal wrapping auto layout; nested Button ve Badge/Text denemesi | Slot recipe ink nested Button label'a ulaşabilir ama Button fill'i footer fill'i olmaz. |
| `icon` / centered grid, 2×icon-size, inherited radius, currentColor border | `icon` frame + vector; F ve ink-only binding | Ayrı font/T style açılmaz; sembol değişimi içeriktir. Icon gerçek part, iç SVG yeni exact part değildir. |

**Card descendant precedence:** child's local/native typography → slot-local/native typography → enclosing Card slot exact recipe → child's exact recipe → child's shared/default. Altı alan ayrı çözülür. Legacy shared content/footer typography yalnız slot/direct text'e etki eder, bu descendant scope'a girmez. Nested Card dış scope'u resetler; Input/Switch/Checkbox scoped typography tüketicisi değildir. Figma CSS cascade'i olmadığı için bu ayrımlar binding ve bağımsız nested-instance specimen'leriyle kanıtlanır; Figma'daki genel bir text style'ın değiştirilmesi eşdeğer sayılmaz.

### Ölçüm protokolü ve tolerans (öneri; pilot öncesi onay bekliyor)

- Aynı code/catalog/registry ve System snapshot kimliği, aynı copy/ikon/font, aynı container genişliği kullanılır. Önce 360 logical px genişlikte, sonra 240px dar specimen; kısa ve çok satırlı uzun içerik; tüm 9 recipe × iki tema = 18 görünüm. Web browser/version/OS/DPR, browser zoom=%100 ve canvas ölçeği, Figma istemci/sürümü ve font bilgisi kanıt kaydına eklenir.
- **Veri doğruluğu:** hex RGB ve alpha, seçilmiş preset/recipe/part/target ve authored numeric readback aynı olmalı; display rounding saklanan değeri değiştiremez. Serialization kaynaklı numeric readback toleransı en çok `0.000001`; 635→600 gibi font quantization veri eşitliği değildir.
- **Geometrik görsel karşılaştırma:** aynı fontla box kenarı/padding/gap/baseline farkı en çok 0.5 logical px hedeflenir; border/radius authored sayıları ayrıca birebir kontrol edilir. Text wrap satır sayısı aynı olmalı; sınırdaki wrap farkları gerekçeli fark kaydına gider, otomatik pass olmaz.
- **Görüntü:** text rasterization/anti-aliasing ve shadow blur motoru farkları tek başına screenshot pixel eşitliğiyle reddedilmez veya kabul edilmez. Shadow preset/offset/radius/color verisi ve taşma gözlemi ayrı kaydedilir. Tolerans aşımı veya farklı font için inceleyen onaylı açık exception gerekir; kritik scope/veri/state farkına tolerans uygulanmaz.
- Her kayıt: test ID, kaynak kimlikleri, recipe/part/target, tema, authored/effective değer, web ölçümü, Figma node/property/style/variable ID, Figma readback, fark/neden, test eden/inceleyen/tarih, screenshot **alındı mı / incelendi mi**. Figma gerçek dosya kanıtı olmadan screenshot veya JSON tek başına pilotu kapatmaz.

### Card pilot kabul tablosu — yalnız SF6.2

Tüm sonuçlar bu görev sonunda **not run**; sahip/authoring erişimi önkoşulu **blocked**. Aşağıdaki pass koşulları planlanmıştır, sonuç değildir.

| ID | İşlem / web ↔ Figma kontrolü | Kabul / kanıt | Şimdi |
| --- | --- | --- | --- |
| P00 | Sahip/inceleyen, araç, izin, font ve baseline freeze | Gerçek oturum/edit erişimi; kimlik seti ve tolerans onayı | blocked |
| P01 | 3 variant × 3 size × iki tema | 18 görünüm, yedi part'ın union coverage'ı; gerçek layer ID'leri | not run |
| P02 | Outlined md title fontSize=19.375/fontWeight=635; root paddingLeft=23.125/top-left radius=17.25 | Üç md variant'ın ilgili exact field'larında aynı authored/readback değerler; sm/lg, diğer kenar/part ve standalone Text/Button sabit. Title color edit'i yalnız selected exact recipe/theme'de | not run |
| P03 | Light/Dark renklerini farklı düzenle; ortak padding/font/shadow/borderWidth değiştir | Renkler bağımsız; non-color her iki modda aynı; eski numeric radius ve sparse omission korunur | not run |
| P04 | Header/title/description ve transparent parent; content/footer nested Text/Button/Badge | Yukarıdaki ink/surface ve descendant cascade; child fill korunur; nested Card reset; field tipografisi etkilenmez | not run |
| P05 | Shared slot typography ile exact slot typography'yi ayrı dene; local child override ekle | Legacy shared descendant scope kazanmaz; local override öncelikli; reset alias/fallback'a döner | not run |
| P06 | 360/240px, kısa/uzun metin, footer wrap, content gap, stroke alignment | Onaylı tolerans; clipping/yeni sahte part yok; typography/font fark kaydı | not run |
| P07 | Web reset/undo/redo ve CSS/JSON export-import; Figma kopyasında binding reset/readback | Web snapshot semantic round-trip; Figma manuel yeniden eşleme. Figma undo'nun web history ile sync olduğu iddiası yok | not run |
| P08 | Gerçek Card dosyasını aç/duplicate et, copy/property/layer edit ve tekrar aç | İnceleyen erişimi; dosya/version/node kanıtı ve incelenmiş karşılaştırma kayıtları | not run |
| P09 | Sınırların handoff'u | Card statik container; focus/loading/native form prototipi yok; API/registry/snapshot kimlikleriyle fark raporu | not run |

**Pilot çıkışı:** P00–P09 kanıtları + gerçek erişilebilir Card dosyası/linki + atanmış inceleyenin onayı. Bir açık blocker veya onaysız kritik fark varken kabul edilmez. Pilotun tamamlanması SF6.3 kit teslimatı değildir.

## 6. Standart kit kabul tablosu — yalnız SF6.3

Pilot onayından sonra başlatılır. Bu tabloda her sonuç **not run**; gerçek kit üretilmedi.

| ID | Kapsam | Ayrı kit kabul koşulu | Şimdi |
| --- | --- | --- | --- |
| K00 | Pilot ve SF4 revalidation | Kabul edilmiş Card pilotu; final code/API/catalog/registry/resolver ve System kimlikleri, açık fark listesi | not run |
| K01 | Yedi komponent | 18/9/12/12/54/9/180 exact key coverage; 294 key'in iki temada 588 görünüm kaydı; gerçek part/target allowlist'i, conditional error ve content modifier açıklamaları | not run |
| K02 | Foundations | Global semantic/base colors + scale/derived references; spacing/size/radius; on Text typography style; font; shadows/focus/motion sınırı. Tüketilmeyen compatibility/helper alanları editable kontrol değil | not run |
| K03 | Tema/shared invariant | Light/Dark color edits bağımsız; tüm geometry/typography/effects ortak; per-size/per-part fractional override, transparent/omission/reset readback | not run |
| K04 | Behavior sınırı | Button hover/pressed/focus/disabled/loading; Input invalid/readonly; choices checked/invalid/indeterminate demonstrasyonları etiketli. Prototype native keyboard, form submission/validation, aria-busy/announcements veya a11y pass değildir | not run |
| K05 | Örnek bileşim | Card + Text/Button/Badge ve field örnekleri; slot/descendant precedence; uzun içerik ve dar layout; editable copy/ikon ve property açıklamaları | not run |
| K06 | Gerçek teslimat ve bağımsız tüketim | Seçilen gerçek `.fig` dosyası veya erişilebilir Community kaydı; kaynağı açma/duplicate; `.fig` verilirse temiz Figma alanına import; instance/property/layer/theme/style edit ve yeniden açma gerçekten denenir. Desteklenmeyen yol gerekçeli N/A; yalnız önizleme resmi yeterli değil | not run |
| K07 | Lisans/erişim | Kit lisansı/attribution, font/icon/asset izin envanteri; paylaşım/export/duplicate yetkileri; inceleyen farklı hedef hesap/alan erişimini dener | not run |
| K08 | Release ve özel sistem ayrımı | Bağımsız kit revision + compatibility tablosu + snapshot hash + bilinen farklar; manuel özel JSON rehberi; otomatik sync/import varmış gibi vaat yok | not run |

Kit release kaydı code Git revizyonu (uncommitted varsa diff kimliği), API contract hash'i, source catalog hash'i, immutable registry hash/bytes, resolver fingerprint, default/özel snapshot hash'i, Figma dosya/version ve kit revision'ını birlikte taşır. Her artifact hash'inin hangi byte/serialization'a ait olduğu yazılır. Güncellenmiş kit eski sürümle sessizce aynı revision sayılmaz. CLI `0.2.1` tek başına kit uyumluluk matrisi değildir.

## 7. Özel System JSON için ilk manuel aktarım rehberi

Bu bir kullanım planıdır; aktarım aracı veya tamamlanmış import değildir.

1. Kullanıcı kendi seçtiği System JSON'u yerelde export eder; özel içerik/gizli bilgi varsa paylaşmadan inceler. Başka app/storage kayıtları toplanmaz; recovery/Project bundle kit kaynağı değildir. Secret/token istenmez.
2. Mevcut `parseDesignSystem` ile normalize edilmiş v3 snapshot alınır; orijinal ham dosya ve canonical normalized hash ayrı tutulur. Geçersiz/unknown veri reddedilir; eski kayıtlar deterministik varsayılanlarla kabul edilir. Light'tan shared normalization'ın etkisi raporlanır; mevcut renkler/kesirler sessizce değiştirilmez.
3. Uyumlu standart kit **kopyası** seçilir. Encoded exact declarations tek tek korunur; mevcut divergent değerler UI size-group politikasına göre kendiliğinden birleştirilmez. Yeni UI edit/reset grubunun kapsadığı declaration listesi ayrı işlem kaydıdır, JSON/Figma kimliği yerine geçmez. Her authored JSON path → kod key/part/target → CSS consumer → Figma node/binding/style ve default/fallback satırı kaydedilir. Mode renkleri, shared sayılar/tipografi, variant/state, shared part, exact recipe sırasıyla ele alınır. `componentDefaults` yalnız örnek içerik/props için açık karar konusudur, style variable değildir.
4. Effective CSS değerleri mevcut resolver'dan alınır; Figma'ya manuel girilir/bağlanır. Sparse override'ın varlığı ve reset destination ayrı not edilir. Çözümlenmiş görsel çıktıdan orijinal sparse JSON'un geri kazanılabildiği iddia edilmez.
5. Font stack yerine seçilen gerçek font/ağırlık doğrulanır. Units/size scaling/shadow/focus/transparent ve Card descendant farklılıkları bu belgenin kurallarıyla denetlenir. Desteklenmeyen binding için açık manual fixed style + fark kaydı gerekir; sessiz fallback yok.
6. Önce Card pilot tablosu, sonra kit coverage'ı ilgili özel snapshot ile tekrar yürütülür. Teslimata özel snapshot hash'i ve paylaşım onayı eklenir; standart kit'i herkese açık özel kullanıcı değerleriyle overwrite etme.

Manuel işlem sırasında bile değerlerin Figma dosyasına yazılması bunları Figma ve dosyaya erişen kişilerle paylaşır. “Yerel JSON okuduk” ifadesi Figma'ya taşınan verinin cihaz dışına çıkmadığı anlamına gelmez.

## 8. Güncel resmî Figma araştırması ve teknik seçenekler

Aşağıdaki sayfalara **2026-10-16 tarihinde erişildi**; bu erişim tarihi, sayfanın yayın/güncelleme tarihi değildir. Hesapta çalışan API veya gerçek authoring testi yapılmadı. Önce denenmiş üç component-property adresi 404 verdi; aşağıdaki erişilebilir ComponentNode referansı kullanıldı. Erişilemeyen URL'ler kanıt kaynağı değildir.

| Ref / resmî kaynak | Erişimde doğrulanan | Varsayılmayan / açık araştırma |
| --- | --- | --- |
| **F1** [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/) | Plugin collection/variable oluşturma, modes, alias/node binding; typography bindings; fontWeight'in geçersiz değerde en yakın ağırlığa çözülme riski; extended collections Enterprise | Her NodeAppearance alanı bindable değildir; gerçek field/type binding ve iki tema mode kapasitesi hedef hesapta denenecek. JSON sample temel örnektir, bambiui importer değildir. |
| **F2** [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/) | Component/instance, property definitions; BOOLEAN/TEXT/INSTANCE_SWAP/VARIANT/SLOT; property unique suffix; auto layout, wrap, hug/fill, stroke-in-layout; fractional stroke/corners; remote component read-only | React compound slots ile Figma SLOT birebir kabul edilmez; kit'in nested instance vs SLOT authoring kararı pilotta. Node exportAsync format listesi `.fig` üretimi kanıtı değildir. |
| **F3** [Plugin Manifest](https://developers.figma.com/docs/plugins/manifest/) | Yeni plugin için `documentAccess: dynamic-page`; `networkAccess.allowedDomains`, `none`; teamlibrary gibi permission türleri; proposed API yayında çalışmaz | Hiç plugin üretilmedi. Plan/organizasyon plugin çalıştırma-yayın politikası, library izinleri ve dağıtım erişimi hesap sahibiyle doğrulanacak. |
| **F4** [Variables REST API](https://developers.figma.com/docs/rest-api/variables/) | Query/create/update/delete variables; diğer dosyalar için publish gerekir. Enterprise ve scope/file access koşulları | Sayfa başlangıcı Full seat isterken GET tablosu “any organization member”, POST “Full seats, admins” der; guest yok. Bu fark hedef hesap ve güncel resmî açıklamayla çözülmeden erişim garanti edilmez. Bu API genel layer/component authoring servisi sayılmaz. |
| **F5** [Working with Text](https://developers.figma.com/docs/plugins/working-with-text/) | `loadFontAsync`, mixed/missing font; görüntülenebilen font editlenemeyebilir; variable font variationSettings ve axis keşfi | Özellikle 635 ağırlığı, hedef font erişimi/lisansı ve browser/Figma metrikleri gerçek oturumda doğrulanacak. |
| **F6** [REST API Rate Limits](https://developers.figma.com/docs/rest-api/rate-limits/) | Seat, endpoint tier ve kaynağın planına göre quota; 429 ve Retry-After; Variables GET Tier 2, POST Tier 3; limitler değişebilir | Sabit throughput, ücretsiz/sınırsız kullanım veya satın alınacak plan fiyatı vaat edilmez. Sayfa 2025-11-17 sonrası limitleri anlatıyor; gerçek hesap/tier bütçesi authoring öncesi tekrar kontrol edilir. |

### Seçenek / izin / network / maliyet kararı

| Yol | Yetki/araç gereği | Veri ve maliyet sınırı / karar |
| --- | --- | --- |
| **Manuel Figma Design** (ilk öneri) | Kit sahibinin edit hesabı, font erişimi, paylaşma/duplicate/export yetkisi; atanmış inceleyen | Kullanıcı değeri Figma dosyasına yazılır; hizmetin kendi ağı/kuralları geçerli. Plan fiyatı, mode/variable/library limitleri ve `.fig`/Community izin koşulları bu tur doğrulanmadı: **araştırma bekliyor**. |
| **Ayrı Plugin API pilotu** | Gerçek Figma editor'da çalıştırılan onaylı plugin; node/font API; gerekiyorsa minimum teamlibrary permission [F3] | REST token gerektirdiği varsayılmaz; `allowedDomains: ["none"]` ile ilave dış ağsız yerel JSON okuma tasarımı adaydır, denenmedi. Bu Figma'nın kendi ağını kapatmaz. Wildcard network, analytics/upload veya özel JSON aktarımı açık onaysız eklenmez. |
| **Variables REST entegrasyonu** | [F4] Enterprise/seat/file yetkileri; GET `file_variables:read`, POST `file_variables:write`; yetkilendirme ayrı güvenli kullanıcı ortamında | HTTPS ile dosya/variable verisi Figma'ya gider; quota [F6], plan bütçesi ve olası entegrasyon işletim maliyeti onaylanmalı. Layer/component üretimi, `.fig` export'u veya tüm JSON'un lossless aktarımı bu endpoint'ten çıkarılmaz. |

API token/OTP/secret sohbete, repoya, dokümana veya Figma node metadata'sına istenmez/yazılmaz. İleride REST seçilirse hesap sahibi yetkilendirmeyi kendi güvenli ortamında yapar; scope minimum tutulur. Bu araştırmada authentication, API mutation, plugin install, Figma dosyasına veri yükleme veya ücretli işlem yapılmadı. Güncel fiyat/plan matrisi, Community yayın/lisans şartları ve gerçek `.fig` import/export yolu ayrıca resmî kaynak ve hesap testi bekliyor; erişilmeyen ayrıntılar hakkında kesin kabiliyet iddiası yok.

## 9. Haklar, authoring-tool ve insan handoff'u

| Karar / sorumlu | Pilot öncesi veya teslimat öncesi gereken kayıt | Şimdi |
| --- | --- | --- |
| Kullanıcı/koordinatör | Kit sahibi/tasarımcı ve bağımsız inceleyen ataması; bütçe/öncelik; paylaşım hedefi | Atama/onay bekliyor |
| Kit sahibi + araç operatörü | Gerçek manuel Figma oturumu veya onaylı authoring tool; edit, mode, component, font, export/duplicate erişim denemesi; araca hangi dosyaların açıldığı | Erişim doğrulanmadı; mevcut agent araçları Figma authoring sağlamıyor |
| Kullanıcı + hak sahibi | Standart kit için ayrı lisans; özel System JSON paylaşım izni; public/private/Community seçimi | Karar bekliyor |
| Kit sahibi | Font family/face/version/weight, font dosyası dağıtım/embedding hakkı; ikon/SVG/asset kaynağı/lisans/attribution listesi | Envanter/review bekliyor; CSS Google preset olması yeniden dağıtım izni değildir |
| İnceleyen | Pilot P tablosu, sonra ayrı K tablosu; gerçek dosya/version ve incelenmiş kanıtlar | not run |
| A/koordinatör + E/kit sahibi | SF4 sonrası kaynak kimliği freeze/revalidation; API değişiklikleri için yeni mapping | Entegrasyon sonrası kapı |

[Mevcut lisans kararı](licensing.md) yalnız CLI ve explicit shared-source allowlist'ini MIT yapar; private Studio, kit tasarımı, marka/logolar veya kullanıcı System JSON'u otomatik MIT değildir. Yazılım NOTICE şartları, font/ikon/asset lisansları ve kit dağıtım lisansı ayrı incelemelerdir. Kit lisansı belirlenmeden Community'ye publish veya `.fig` redistribution yapılmaz; Community'nin kendi koşulları araştırılıp hak sahibince onaylanır. Lisans/attribution metinleri gerçek dosyayla birlikte ve release kaydında bulunmalıdır.

**Handoff sırası:** E araştırma sözleşmesi → kullanıcı sahip/inceleyen/dağıtım-lisans kararları → gerçek authoring aracı ve erişim kontrolü → SF4 baseline revalidation → Card pilotu ve bağımsız kabul → yedi komponent/foundations authoring → ayrı kit kabulü/teslimat. Bu zincir bu doküman görevinin otomatik devamı değildir. Erişim/sahip yoksa SF6.2 blocked kalır. SF5 sonrası SF7'nin başlayıp başlamaması kullanıcı/koordinatörün ayrı kararıdır; kit yok diye yeni komponentlere kendiliğinden başlanmaz.

## 10. Agent E teslim kaydı

- **Görev / SF ID:** SF6.1 / mapping araştırması ve pilot/kit kabul sözleşmesi.
- **Değişen dosya:** yalnız `docs/figma-kit-contract.md` (yeni). Uygulama/API/recipe/token/storage davranış farkı yok; diğer agent/kullanıcı değişiklikleri korunur.
- **Doğrulama:** gerçek component TSX, katalog/allowlist, token schema ve CSS tüketimi okundu; bellekte `createSourceCatalog()`/canonical JSON hash'i ve arşiv ham hash/byte sayısı karşılaştırıldı; 18/9/12/12/54/9/180 sayıları gerçek katalog fonksiyonundan alındı; default snapshot hash'i hesaplandı. Node yalnız module-type uyarısı verdi, hesaplar tamamlandı; bu uyarı için package değişikliği yapılmaz.
- **Resmî araştırma:** F1–F6 içeriklerine 2026-10-16 erişildi; auth/hesap veya API çalışma testi değil. Fiyat/plan ayrıntıları, Community koşulları ve import/export yetkileri araştırma/insan doğrulaması bekliyor.
- **Çalıştırılmayanlar:** uygulama unit/browser/build/CLI generator testleri; araştırma-only write set için gerekli değil ve ortak generated alanlarda D'nin validation kilidi korunmalı. Gerçek Figma üretimi, Card/kit görsel testi, manuel kullanıcı kabulü, import/duplicate/edit, publish/commit/deploy yapılmadı.
- **Diğer agent interface/patch ihtiyacı:** yok. Kaynak API/recipe sayılarında okunan sözleşmeyle çelişki bulunmadı; Figma eşdeğerlik sınırlamaları yukarıda açık. Final freeze ve sahip/araç/haklar olmadan SF6.2'ye geçilmez.
- **Risk / geri dönüş:** erken araştırma SF4 sonrası bayatlayabilir; kimlik+mapping revalidation zorunlu. Yeni belge uygulamaya yazmadığından storage migration veya runtime rollback gerektirmez. Bu kayıt roadmap checkbox'larını kapatmaz.
