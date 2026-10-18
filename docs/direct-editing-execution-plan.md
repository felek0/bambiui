# bambiui · Doğrudan komponent düzenleme planı

Tarih: 2026-10-17. Aktif ürün sırası `roadmap.md`; bu belge doğrudan düzenleme iş paketlerini, agent sınırlarını ve kabul kapılarını tanımlar. Project authoring kapsam dışıdır. İnsan/Figma kullanıcı oturumu şu an mümkün değil; açık araştırma kapısıdır, uygulamanın önkoşulu değildir.

## UX sözleşmesi

- Frame: geometrik tutamaçlar seçili elemanın üstünde; araç çubuğu, kapsam, ipucu ve grup Reset'i specimen'in hemen altındaki tek araç yüzeyindedir (DE7 kararı: örnek etiketini veya specimen'i örtmez). Text: kompakt tipografi araçları. Sağ panel hassas düzenleme, reset ve kaynak açıklamaları için kalır.
- Tüm araçlar birlikte görünmez: Size, Spacing, Corners gibi bağlamsal modlar. Varsayılan resize ancak boyut davranışı güvenle uygulandığında devreye girer; bugünkü Padding/Margin modu şimdilik korunur.
- Seçimin yanında component/size/part ve etkilenen kombinasyon sayısı görünür. Geometri/tipografi iki temaya aynı-size kapsamında; renk exact recipe/current theme kapsamında yazılır. Text ayrıca tipografik variant sınırını korur.
- Seçmek veya editör açmak override üretmez. Reset yalnız ilgili grubun alanını kaldırır; miras alınan değeri kopyalayıp saklamaz.
- Bir sürükleme veya sayı onayı tek Undo hareketidir. Önizleme yalnız seçili örnektedir; bırakma/onay diğer örnekleri günceller. Export yalnız saved System kullanır.
- Sayı girişinde Enter/Apply onaylar; Escape/Cancel/dışarı çıkma/bağlam değişimi taslağı atar. Sessiz blur commit yok. Geçersiz değer kırpılıp saklanmaz; alan hatası gösterilir.
- UI İngilizce; yeni schema, token, public prop, bağımlılık veya otomatik publish/deploy yok.

## Aşamalar

| İş | Teslimat | Bağımlılık | Durum |
| --- | --- | --- | --- |
| DE0 | Mevcut metadata/CSS/gesture incelemesi ve görev sınırları | — | İki agent incelemesi tamamlandı |
| DE1 | Spacing kenarına tıklayarak tam hassasiyetli sayı girişi; klavye, hata, iptal | DE0 | Uygulandı; otomatik entegrasyon kontrolü geçti |
| DE2 | Corners modu; dört radius alanı, bağımsız veya açıkça bağlı düzenleme; sayısal giriş + köşe sürükleme | DE1 kabulü | Uygulandı; otomatik entegrasyon kontrolü geçti |
| DE3 | Width/height için mevcut değer kaynağı, Hug/Fill/Fixed seçimi ve sayısal düzenleme | DE1 kabulü | Uygulandı; otomatik entegrasyon kontrolü geçti |
| DE4 | Önce sağ/alt kenar, sonra köşeden resize; açık Fixed geçişi | DE3 | Uygulandı; otomatik entegrasyon kontrolü geçti |
| DE5 | Desteklenen katmanlarda gap: sayısal giriş; tek eksenli görünür aralıkta sürükleme | DE1 + layout incelemesi | Uygulandı; otomatik entegrasyon kontrolü geçti |
| DE6 | Text seçimine yakın font size/weight/line-height/color araçları | DE1 + scope UI | Uygulandı; otomatik entegrasyon kontrolü geçti |
| DE7 | Tek bağlamsal araç yüzeyi, reset/kapsam tutarlılığı, mobile/AX/zoom kabulü | DE2–DE6 | Uygulandı; otomatik kabul geçti, insan kapıları açık |

### DE1 — Sayısal spacing

- Tıklama ile drag eşikle ayrılır; sürüklemenin click'i input açmaz.
- Input slider/button içine gömülmez. Enter/Space ile açılır, başlangıç değeri yuvarlanmaz.
- Padding 0–1000, margin −1000–1000; kesirler korunur. Boş/NaN/infinite/out-of-range reddedilir.
- Enter/Apply yalnız değişmiş geçerli değeri bir kez yazar. İptalde focus açık eylemlerde tutamaca döner; başka hedefe geçişte focus çalınmaz.
- Sağ panelde kalan taslakla, pointer capture ile ve gizli Variants/Playground lifecycle'ıyla yarış olmaz.

### DE2 — Corners

- Mevcut dört `border*Radius` alanı kullanılır; shorthand token eklenmez.
- Bağımsız varsayılan; Link corners açık kullanıcı eylemidir. Bağlama tek başına eski divergent değerleri eşitlemez; ancak sonraki doğrudan edit açıklanan gruba uygulanır. Sağ panel reset'i mevcut alan kapsamını korur.
- Radius metadata'sı olmayan katmanda araç yok. Gerçek tüketici/sınırları doğrulanır; Switch pill davranışı sessizce bozulmaz.
- Bir köşeyi düzenleme diğer köşeleri, parçaları ve size gruplarını değiştirmez.

### DE3–DE4 — Boyut ve resize

- Fixed, şemaya yeni string değil sayısal px olarak yazılır. `hug`: width fit-content, height auto. `fill`: %100; flex kalan alanı doldurma vaadi verilmez.
- Kaydedilmiş mod/kaynak ile ölçülmüş px ayrı gösterilir. Mod computed px'den tahmin edilmez; override yokken mevcut değer ve ayrı Reset/default kaynağı sunulur, belirsiz `Inherited` etiketi kullanılmaz.
- İlk resize sağ/alt kenardır; yalnız ilgili ekseni fixed yapar, konum/margin değiştirmez. Hug/Fill'den Fixed'e geçiş görünürdür.
- Önizleme ve commit; border-box, min/max, açık height'ın minHeight davranışı ve Switch thumb hizasında aynı sonucu vermelidir.
- Belirsiz ebeveyn yüksekliği, fullWidth/iconOnly, uzun metin, Text inline→inline-block ve checkbox işaretinin ölçeklenmemesi kapsanır.

### DE5 — Gap

- Metadata allowlist'i ve gerçek flex/grid layout birlikte doğrulanır.
- Button/Badge root; Input root/control ve ikonlu error; choice root/row ve ikonlu error; Card root/header/content/footer mevcut adaylardır. Text, choice control ve Card title/description/icon için araç yok.
- Tek görünür çocukta sürükleme yok; görünür aralık bulunmadığı açıklanır. Wrap/grid ilk etapta sayısal kontrolle sınırlıdır.
- Çocuklar arasındaki ölçülmüş mesafe gap değildir: margin, justify-content ve wrap etkileri ayrılır. Gerçek çocuk pozisyonlarıyla paint testi gerekir.

### DE6 — Tipografi ve görsel araçlar

- Text hedefinde font size, weight, line height, color; destekleniyorsa hizalama. Boyut kutusunu resize etmek fontu büyütmez.
- Sayısal değer girişi önce, etiket sürükleme sonra. Font weight mevcut tamsayı sınırlarına uyar.
- Frame fill/border gibi renk araçları sonraki yüzey iyileştirmesidir; renkler exact/theme, border width aynı-size non-color kapsamını görünür ayırır. Focus outline ayrı kalır.

## Çoklu agent çalışma düzeni

| Agent | Sorumluluk | Yazma sınırı |
| --- | --- | --- |
| A — Etkileşim | DE1 sayısal input, gesture lifecycle, validation helper/unit | `frame-spacing-editor.tsx`, `.module.css`, yeni `spacing-numeric-draft.*` |
| B — Kabul | DE1 browser senaryoları; önce resize/gap tüketim incelemesi | `scripts/studio-smoke.mjs` |
| Koordinatör | Plan, kapsam kararı, review, entegrasyon ve seri build/browser | Bu belge, roadmap; gerekirse entegrasyon düzeltmeleri |

DE2 ve DE3 araştırması paralel yapılabilir; aynı component-matrix/gesture dosyasına eşzamanlı yazılmaz. DE4, DE3 kodu birleşmeden uygulanmaz. Test agent'ı implementasyonun aynısını tekrar yazmaz. Build/generator/fixture üreten testler tek koordinatör tarafından seri çalıştırılır.

## Kabul ve done

1. Saf unit: alan allowlist'i, sınır, kesir, no-op, aynı-size üyelik, Text variant ayrımı.
2. Gerçek Chromium: pointer click/drag ayrımı, Enter/Space, focus, hatalar, Escape/cancel, dış tıklama, tema/component/System/import/undo/mod geçişleri, tek Undo/Redo, storage yazmayan taslaklar.
3. Kapsam: yedi komponent, nested Card/input/choice katmanları, iki tema, diğer size/part değerlerinin korunması.
4. Teslimat: CSS/JSON/ZIP saved snapshot izolasyonu, Playground bağımsızlığı, source catalog/registry kimliğinin korunması.
5. TypeScript, lint, production build; dar viewport ve küçük frame hit hedefleri.
6. İnsan görevi, gerçek VoiceOver, native %200 zoom ve gerçek mobil dokunma ayrı açık kapılardır. Otomatik test geçmesi bunların yerine geçmez.

## DE7 uygulama kanıtı

Ekran görüntüsü incelemesi iki sorun gösterdi: araç çubuğu örnek etiket satırına sıkışıyor (Text geçişi eklenince Button'ın `Small` seçim etiketini tamamen örttü) ve resize ipucu dar sütunda taşıp `Test interaction states` ile çakışıyordu. Karar: seçili örnekte specimen'in altında akışta duran tek araç yüzeyi (`data-tool-surface`). İçinde `role="toolbar"` (ok/Home/End ile gezinme, `rovingIndex`), aktif aracın adı, gerçek yazma kapsamı (`editScopeLabel`: `6 combinations at sm · both themes` / `This combination · Dark only`), mod ipucu (gap yoksa nedeni, resize sırasında bekleyen değer) ve grup Reset'i bulunur. Size ve Text panelleri bu yüzeye bağlı açılır; yalnız tutamaçlar ve sayısal değer popover'ı frame üstündedir (popover yüzeyin üstünde katmanlanır). Etiket ve specimen hiçbir araçla örtülmez; seçim specimen'i kaydırmaz, yalnız altındaki içerik aşağı iner.

- Frame ↔ Text: frame çubuğunda `Text`, aynı katmanın text hedefine; kökte ayrı text hedefi yoksa komponentin tek text katmanına (Button/Badge etiketi) gider (`textTargetFor`; birden çok text katmanında tahmin yok). Text çubuğunda `Frame` (eski `Frame spacing`) geri döner. Input control gibi katmanlar böylece Text araçlarına da ulaşır.
- Grup Reset: Padding/Margin/Corners/Gap/Resize için aynı-size grubunda (peer-only dahil) yalnız o grubun anahtarlarını kaldırır, mirası kopyalamaz, tek Undo adımıdır; kaldırılacak bir şey yoksa devre dışıdır. Size paneli ve Text satırları kendi alan reset'lerini korur.
- Resize ipucu artık durum satırındadır ve W/H tutamaçlarının `aria-describedby` hedefidir.

Browser kabulü: çubuk ok/Home/End/kaydırma sarması, durum satırının specimen altında konumu, araç başına kapsam/ipucu, Reset devre dışı → etkin → varsayılana dönüş → tek Undo, resize açıklaması, Text ↔ Frame gidiş-dönüş; 700 ve 390 px genişlikte belge taşması yok, çubuk ve durum görünür alanda, hedefler ≥ 24 px, spacing tutamaçları ≥ 20 px, Size paneli viewport içinde. Component matrisi kamera transform'u kullanmadığından (native scroll) canvas zoom'u tutamaç hizasını etkilemez; tarayıcı native zoom'u insan kapısıdır.

712 app testi, 120 Studio, 22 Playground, 17 System-only ve 8 source/CLI/JSON browser grubu; TypeScript, lint, production build ve diff whitespace geçti. Açık insan kapıları: gerçek dokunmatik cihazda sürükleme ergonomisi, VoiceOver ile toolbar/slider okunuşu, native %200 zoom ve tasarımcı görev testi. Otomatik testler bunların yerine geçmez.

## DE6 uygulama kanıtı

Text hedefi seçildiğinde örneğin sağ üstünde `Text` düğmesi (Frame spacing'in yanında) çıkar; panel varsayılan kapalıdır, böylece seçili specimen ve iç katmanlar tıklanabilir kalır. Panel yalnız katmanın gerçekten tükettiği alanları gösterir (`textToolFields`): Size, Weight, Line height, Letter spacing, Align, Color. Bütün text hedeflerinde altı alan da vardır; frame hedefleri (ör. Input control, Card content/footer, Switch control rengi) bu dilimde yalnız sağ panelden düzenlenir.

Her satır kayıtlı override'ı veya kaynağı ve ayrıca ölçülen değeri gösterir; açmak/seçmek override yazmaz. Sayısal ve hex girişte Enter/✓ uygular, Escape veya satırdan çıkmak taslağı atar; boş değer hata verir (override kaldırmak yalnız ↺ Reset ile). Doğrulama inspector'la aynı `appearanceStyleDraft` sözleşmesidir (kesirler korunur, font weight tamsayı, renk altı haneli hex). Align seçenekleri anında uygulanır. Sayısal etiketler yatay sürüklenir (2 px = 1 adım; weight 100'lük; Alt ince adım); önizleme kayıtlı CSS ile aynı recipe değişkenlerini yalnız seçili örneğe yazar, bırakma tek commit'tir, Escape/pointercancel geri alır. Sürükleme başlangıcı pointer-down anında senkron ölçülür; bir önceki iptal edilmiş önizlemenin gecikmeli ölçümü başlangıç olarak kullanılmaz (testte yakalanan yarış).

Kapsam görünür: tipografi aynı size (+ Text variant) grubunda iki temaya (`N combinations at sm · both themes`), renk yalnız bu kombinasyon ve aktif temaya yazılır. Unit: alan allowlist'i, kapsam etiketi, draft doğrulama/no-op, scrub sınırları, peer-only reset kaynağı ve bütün text katmanlarında preview değişkenleri = kayıtlı CSS. Browser: Text paragraph.sm'de geçersiz/Escape, kesirli Enter (altı tone, iki tema), scrub Escape iptali + komşu örneğe sızmama + tek Undo, Align + Reset, aktif-tema-only renk, Card title font weight Card md kapsamı. İlk browser koşusu Align satırında `leftpx` birim hatasını yakaladı; düzeltildi ve test eklendi. 708 app testi, 118 Studio, 22 Playground, 17 System-only ve 8 source/CLI/JSON browser grubu; TypeScript, lint, production build ve diff whitespace geçti. Gerçek mobil dokunma, VoiceOver ve native zoom açık kapılardır.

## DE5 uygulama kanıtı

Frame araç çubuğuna, metadata'da `gap` alanı olan katmanlarda `Gap` modu eklendi (Button/Badge root; Input root/control/error; Switch/Checkbox root/row/error; Card root/header/content/footer). Text, choice control ve Card title/description/icon için araç yoktur; unit test bu allowlist'i bütün recipe'lerde doğrular. Tek tutamaç gösterilen değeri computed main-axis gap'ten (`columnGap`/`rowGap`, `normal`→0) alır; çocuklar arası ölçülen mesafe gap sayılmaz.

`gap-layout.ts` görünür aralığı gerçek DOM'dan çıkarır: in-flow element ve boş olmayan anonim metin item'ları, `display: contents` açılımı, row/column(-reverse) görsel sırası. Button/Badge'in `gap: inherit` içerik sarmalayıcısına yalnız aynı komponentin farklı part'ıysa inilir; Card footer içindeki Button gibi iç içe komponentler item sayılır. Sürükleme yalnız nowrap flex ve en az iki görünür item varsa, yalnız ana eksende açılır; tutamaç ilk iki item arasındaki boşluğun ortasına konur. Grid, wrap, flex olmayan veya tek item'lı katmanlarda tutamaç yalnız sayısal editörü açar ve nedeni `title`/`aria-describedby` ile açıklanır. Gerçek specimen sonucu: Input root, Switch root/row, Checkbox row, Card root/header sürüklenebilir; metin-only Button/Badge, Input control/error, Card content (grid) ve Card footer (wrap) sayısal.

Sayısal giriş, Escape/dış tıklama iptali, ok tuşları ve tek Undo DE1 draft altyapısını kullanır; kapsam aynı-size/iki-tema. Browser kanıtı: Card header (dikey) ve Switch row (yatay) sürüklemesinde preview kaydetmez, item'lar arası gerçek paint mesafesi tam delta kadar artar, commit paint'i aynıdır, peer kapsamı doğrudur ve tek Undo geri alır; sürüklenemeyen katmanda hareket yazmaz, Enter ile kesirli (13.375) değer kaydedilir. 702 app testi, 117 Studio, 22 Playground, 17 System-only kontrolü, TypeScript, lint, build geçti. Studio smoke watchdog'u kontrol sayısı arttığı için 180 s'den 300 s'ye çıkarıldı (tam koşu ~2 dk). İkonlu Button/Error gibi iki item'lı varyantlar specimen matrisinde bulunmadığından gerçek tarayıcıda yalnız unit geometri ile kapsandı.

## DE4 uygulama kanıtı

Size panelindeki `Resize on frame` seçili örnekte sağ (W), alt (H) ve sağ-alt köşe tutamaçlarını açar. Kenar tutamaçları `role="slider"`dır; ok tuşları ilgili ekseni tek history adımıyla Fixed yapar. Köşe tutamacı yalnız pointer kısayoludur (`tabIndex=-1`, `aria-hidden`); klavye kullanıcıları iki kenar slider'ını kullanır. Köşe sürüklemesi yalnız gerçekten değişen eksenleri Fixed'e çevirir (`resizeCornerPatch`); dokunulmayan eksenin Hug/Fill/default niyeti korunur. Başlangıç değeri ölçülen border-box'tır; kayıtlı Fixed değeri layout tarafından kısıtlanmamışsa kesirli değer korunur.

Önizleme, kayıtlı CSS ile aynı `componentRecipeVariables` yardımcılarını kök elemana geçici değişken olarak yazar (box-sizing, açık height için `min-height: 0`, Switch thumb transform, Text/Card title inline-block dahil); bırakma tek scoped patch ile aynı-size/iki-tema kapsamına yazar ve preview ile commit paint'i birebir aynıdır. Escape, pointercancel, lost capture, dış tıklama, pencere blur'u, görünürlük ve workbench/tema bağlamı değişimi bütün geçici değişkenleri geri alır ve yazmaz. Konum/margin değişmez.

698 app unit/SSR/source testi, 116 Studio browser kontrolü (yedi komponentte kenar resize preview=commit, köşe width-only/height-only/iki eksen + Hug korunumu + tek Undo, Hug/Fill iptal yolları, klavye), 22 Playground ve 17 System-only kontrolü geçti. TypeScript, lint, production build ve diff whitespace temiz. Playground smoke'taki inspector değer kontrolü, Variants'a dönüşte ölçümün bir animation frame sonra yenilenmesini bekleyecek şekilde düzeltildi; bu yarış DE çalışmasından önce HEAD'de de mevcuttu. Belirsiz parent height'ta Fill ve gerçek mobil dokunma/VoiceOver/native zoom açık kapılardır.

## DE3 uygulama kanıtı

Agent kullanım sınırı nedeniyle bu dilim koordinatör tarafından uygulandı. Frame araçlarına Size modu eklendi; width/height için Use defaults, Hug, Fill, Fixed seçimi ve bağımsız sayısal draft vardır. `ThemeTokens` yalnız Studio editörüne taşınır; `styleSourceInfo` ile exact/shared/CSS kaynak sınırı belirlenir. Kaydedilmiş boyut niyeti computed px'den tahmin edilmez; Rendered ölçüsü ayrı satırda gösterilir. Shared değerin üstüne override yoksa mod Use defaults olarak kalır, shared kaynağı ve gerçek kayıt değeri ayrıca gösterilir.

Enter/Apply değişen geçerli ekseni tek scoped patch ile yazar. Cancel, Escape, dışarı focus/tıklama, mod/selection/context değişimi draft'ı atar. Reset aynı-size grubundaki yalnız ilgili ekseni kaldırır; seçili kayıtta override bulunmasa bile peer override'ı resetlenebilir. Padding, diğer eksenler, shared defaults ve renkler korunur. Fixed 0–10000px ve kesirli değerleri destekler; Fill `%100` parent boyutu olarak açıklanır, height için definite parent gereksinimi belirtilir. Hug width fit-content / height auto olarak açıklanır. Min/max ve layout kısıtları ayrı kalır; resize gesture eklenmedi.

688 app unit/SSR/source testi, 113 Studio browser kontrolü, 22 Playground kontrolü, 17 System-only kontrolü ve 8 source/CLI/JSON browser grubu geçti. TypeScript, lint, production build, source catalog freshness ve diff whitespace başarılı. Browser kanıtı Button sm fractional Fixed/Hug/Fill, gerçek Fixed/Fill genişlik paint'i, iki-tema/same-size storage, invalid draft/Escape/Playground iptali, Text paragraph.sm altı tone kapsamı, bağımsız eksen reset/no-op/Undo'dur. Unit kapsamı yedi komponentin tüm desteklenen katmanları, shared/exact kaynak ayrımı ve peer-only reset'i içerir. Her komponentin bütün Hug/Fill layout kombinasyonları gerçek tarayıcıda doğrulanmış sayılmaz; özellikle Switch thumb, belirsiz parent height ve fullWidth/iconOnly resize kabulü DE4'te kalır.

Bu tarihsel DE3 baseline'ında dar ekran gerçek dokunma, VoiceOver/native zoom açıktı; CLI unit paketi ayrıca çalıştırılmamıştı. Dağıtılan kaynaklar ve registry değişmedi; commit/deploy/publish yoktu. DE4–DE7 bu baseline'da henüz uygulanmamıştı; güncel uygulama kanıtları yukarıdadır.

## DE2 uygulama kanıtı

İki agent ayrık yazma sınırlarıyla Corners UI/helper/unit ve browser kabul testlerini uyguladı. Metadata'da desteklenen dört radius alanı köşe tutamacı ve sayısal girişle düzenlenir. Bağımsız varsayılan; Link corners yalnız sonraki değişmiş değeri bütün desteklenen köşelere tek patch ile uygular. Toggle ve değişmemiş giriş divergent değerleri normalize etmez. Köşeden içeri çapraz sürükleme artırır, dışarı sürükleme azaltır. Linked geçici DOM stillerinin tamamı iptalde geri alınır; kalıcı yazı mevcut aynı-size/iki-tema politikasını kullanır.

679 unit/SSR/source testi, 111 Studio browser kontrolü, 22 Playground kontrolü ve 8 source/CLI/JSON browser grubu geçti. TypeScript, lint, production build, catalog freshness ve diff whitespace kontrolü başarılı. Browser kanıtı: dört bağımsız köşe, nested Card header, kesirli numeric giriş, linked/no-op/cancel, gerçek pointer drag/Escape/pointercancel, paint/storage izolasyonu ve tek Undo. Undo mevcut workspaceRevision yaşam döngüsü gereği editörü yeniden başlatır; mod Padding ve linking kapalı duruma döner. Testler bunu açıkça dikkate alır. Gerçek mobil/VoiceOver/native zoom ve küçük frame'lerde insan kullanım değerlendirmesi açık. System-only ve CLI unit paketleri bu dilimde ayrıca çalıştırılmadı; dağıtılan kaynaklar değişmedi.

Doğrudan radius reset bu dilimde eklenmedi; reset sağ paneldeki mevcut alan kapsamını kullanır. Bağlantılı mod yalnız doğrudan edit için geçerlidir, inspector reset davranışını değiştirmez. Bu DE2 baseline'ında DE3–DE7 henüz uygulanmamıştı; güncel DE3 kanıtı yukarıdadır. Commit/deploy/publish yapılmadı.

## DE1 uygulama kanıtı

İki agent ayrık dosyalarda çalıştı: A UI ve saf numeric validation, B browser kabul testleri. Koordinatör inceleme ve entegrasyonu gerçekleştirdi. 669 app unit/SSR/source testi, 108 Studio browser kontrolü, 22 Playground kontrolü ve 8 source/CLI/JSON browser grubu geçti. TypeScript, lint, production build, source catalog freshness ve diff whitespace kontrolü başarılı. Yeni senaryolar click/drag ayrımı, Enter/Space, fractional Apply/Enter, değişmemiş değer, geçersiz/boş/sınır dışı giriş, Escape/Cancel/blur, seçim/mod değişimi ve tek Undo'yu kapsar. System-only ve CLI unit paketleri bu dilimde ayrıca çalıştırılmadı. Registry kaynakları değişmedi; commit/deploy/publish yapılmadı.

Gerçek mobil/VoiceOver/native zoom açık. Mevcut slider ok tuşu tekrarlarının ayrı history hareketleri üretmesi sonraki ortak gesture oturumu çalışmasında değerlendirilecek; DE1 sayı onayı ve drag tek hareket olarak doğrulandı.

Her aşama sonunda gerçekleşen kapsam, test kanıtı ve kalan riskler kaydedilir. Bu belge bütün fazların uygulanmış olduğu iddiası değildir.
