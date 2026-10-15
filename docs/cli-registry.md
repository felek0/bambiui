# bambiui · CLI ve statik registry

Tarih: 2026-10-15 · Yayımlanan CLI: `bambiui@0.2.0` · Patch adayı: `0.2.1` · Registry/config formatı: v1.

## Ürün kararı ve durum

Developer teslimatının ana yolu CLI + statik registry'dir. System/Develop yerel CLI komutlarını gösterir; ZIP kapalı başlayan **Manual source ZIP (fallback)** altında korunur. D03 frame ZIP işi bekletildi; Project backup ve frame verisi komponent registry'sine karıştırılmaz.

`packages/cli/` ayrı npm paketidir; özel Next uygulamasının root package.json'ı yayımlanmaz. Paket adı `bambiui`, ilk CLI sürümü `0.2.0`, public npm hedefi [npmjs.com/package/bambiui](https://www.npmjs.com/package/bambiui). İlk uygulama turu gerçek npm yayını/deploy yapmadı. 2026-10-15 MIT/yayın turunda hesap maintainer eşleşmesi doğrulandı; incelenen tarball için publish denemesi npm 2FA (`EOTP`) nedeniyle durdu. Kullanıcı sonrasında yayını tamamladı; npm metadata'sı version=0.2.0, license=MIT ve latest=0.2.0 olarak doğrulandı. Public tarball SHA-512 incelenen paketle aynı; npm'den indirilen CLI ile init/add/theme ve React/Next browser tüketicisi geçti. Develop artık yayımlanmış npx komutlarını kopyalar.

## Komutlar

Yerel CLI kurulu/link edilmişken:

```sh
bambiui init --registry http://localhost:3000/registry/index.json
bambiui init --registry http://localhost:3000/registry/index.json --system ./bambiui-tokens.json
bambiui add button
bambiui add card input checkbox
bambiui add --all
bambiui add layout
bambiui theme --system ./bambiui-tokens.json
```

İki init satırı alternatiftir; mevcut kurulumda ikinci init çalıştırılmaz. İkinci sistem JSON'u `theme` ile uygulanır. Yayımlanmış public giriş `npx bambiui@0.2.0 init ...` / `npx bambiui@0.2.0 add button` olarak doğrulandı.

Yayımlanan `0.2.0` sürümünde noninteractive `init` explicit `--registry` ister; TTY'da eksikse URL sorulur. `0.2.1` adayı varsayılan olarak doğrulanmış `https://bambiui.com/registry/index.json` adresini kullanır: `bambiui init` yeterlidir, `--registry` özel registry için korunur. Mevcut proje pinleri değişmez. System/Develop mevcut uygulama origin'inin `/registry/index.json` adresini kullanır. HTTPS gerekir; HTTP yalnız localhost/127.0.0.1/IPv6 loopback için geliştirme istisnasıdır. Credentials/query/fragment ve HTTP redirect reddedilir.

### init

- Mevcut React 19 + TypeScript/CSS Modules host'u hedefler; uygulama scaffold etmez. Node.js 22.15+ gerekir.
- `bambiui.json`, scoped iki tema CSS'i, `ThemeScope.tsx`, scoped baseline, System snapshot ve kurulum README'si yazar. Henüz komponent kurmaz.
- `--dir` verilmezse gerçek `src/` klasörü olan host'ta `src/components/bambiui`, diğerinde `components/bambiui` seçilir. Göreli importlar korunur; alias rewrite gerekmez.
- `--system` verilirse yerel System JSON'u aynı Studio parser/resolver'ıyla normalize edilir; verilmezse default system kullanılır. System Parameters snapshot'ta kalır; React API defaults yeniden yazılmaz.
- Mevcut `bambiui.json` sıfırlanmaz. Bozuk/gelecek config'i sessizce migrate etmez.

### add

- Desteklenen built-in'ler: Button, Input, Card, Badge, Switch, Checkbox, Text; ayrıca explicit `layout` item'ı Container/Stack/Grid'i taşır.
- Registry'den yalnız gerçek kaynak dependency closure'ı kopyalanır. Card'ın örneğinde Button/Text bulunması onları Card'ın gerçek bağımlılığı yapmaz. Shared component CSS tam kalır; unused TSX kaynakları kurulmaz.
- `ui/index.ts` kurulu public item'ları dışa açar; Field/Spinner gibi internal yardımcıları public API diye sunmaz.
- Gerekli Base UI host'ta eksikse package.json'a registry'nin test edilen exact sürümü eklenir. Mevcut deklarasyonlar korunur; farklı range için advisory verilir. React otomatik yükseltilmez.
- Paket yöneticisi, lifecycle/install script'i veya lockfile değiştirme çalıştırılmaz. Host entry/layout otomatik yamalanmaz. `0.2.1` adayı Next/React entry dosyasını bulup entry-relative stylesheet/ThemeScope importlarını stdout ve README'de gösterir; entry bulunamazsa örneklerin proje köküne göre olduğu belirtilir. Eksik Base UI eklendiğinde packageManager/lockfile'a göre npm/pnpm/yarn/bun install önerilir, otomatik çalıştırılmaz.

### theme

- `--system` zorunlu; yerel dosyadan iki temayı uygular, registry isteği yapmaz.
- Komponent kaynaklarını ve host instance içeriklerini yeniden yazmaz. Editlenmiş theme/scope dosyaları da conflict korumasına dahildir.
- Eski System kayıtları, Light'tan paylaşılan non-color geometri/tipografi, bağımsız tema renkleri, sparse reset, exact recipe/part stilleri, focus sınırları ve tarihsel kesirler Studio ile aynı motoru kullanır. İkinci bir CLI token dönüştürücüsü yoktur.

## Registry ve build

`npm run dev/build` artık kaynak catalog'una ek olarak registry üretir:

```text
app/studio/components + layout
        ↓ source-collector.mjs (aynı authoritative import grafiği)
source catalog
        ↓ generate-registry.mjs
public/registry/index.json
public/registry/releases/<sha256>/registry.json
        ↓ Next static export
out/registry/...
```

Index strict `bambiui.registry-index` v1 metadata'sıdır. İçinde immutable release'in relative path, SHA-256, UTF-8 byte size kaydı bulunur; MIT kararı sonrası warnings boş listedir. Release onaylı MIT spdx/text kaydını taşır; CLI eksik veya farklı lisansı reddeder. `bambiui.registry` v1 release'i doğrulanmış source catalog ve CLI tema resolver fingerprint'ini taşır. Registry source content'tir; kullanıcı JSON'u, callback veya çalıştırılacak installer script'i değildir.

`build-cli.mjs`, authoritative `source-theme.ts` ve catalog parser'ının saf TypeScript grafiğini `.mjs` olarak CLI `dist/` içine derler. Npm CLI runtime'ında TypeScript/Next/React/fs collector bağımlılığı yoktur. Registry, CLI ve proje config'i aynı compiled resolver SHA-256 kimliğini doğrular; yanlış resolver ile tema uygulanmaz. Bu fingerprint System schema v3, registry v1 veya CLI semver `0.2.0` ile aynı sürüm ekseni değildir.

`bambiui.json` formatı `bambiui.project` v1'dir. Output directory, installed item listesi, immutable registry URL/byte/hash, resolver hash, system hash ve CLI'nin yazdığı dosyaların hash'lerini içerir. Kendisini veya host package.json'ını self-hash etmez. `add`, floating index'i tekrar okuyup sürümü değiştirmez; kaybolan pin için latest fallback yoktur.

Generator aynı içerik için index/release dosyalarını yeniden yazmaz. Kalıcı geçmiş artık [registry/](../registry/README.md) altında Git'te tutulur: releases.json envanteri ve hash klasöründeki exact JSON byte'ları. Her temiz dev/build, envanterdeki tüm snapshot'ları public/registry ve out/registry altına yeniden taşır; current index en son güncellenir. Eksik/bozuk/listelenmemiş/symlink snapshot build'i durdurur. Eski component ID'leri veya resolver hash'leri bugünkü şemaya göre migrate/filtre edilmez.

`npm run registry:snapshot` yeni source release'ini explicit arşivler; snapshot ve envanter birlikte Git'e alınmalıdır. Normal build geçmişi prune etmez veya yeniden lisanslamaz. İlk public release canlı hash'le karşılaştırılarak arşivlendi. Bu kodun production retention sağlaması için arşiv dosyaları commit edilip yeni build deploy edilmelidir; otomatik commit/deploy yapılmaz. Ayrı backend/CDN sağlayıcısı gerekmez.

## Dosya ve veri güvenliği

- `--dry-run`: planı doğrular, dosya/lock yazmaz. Registry GET okuması yapabilir.
- Mevcut hedef birebir aynıysa no-op. CLI'nin izlediği orijinal hash hâlâ eşleşiyorsa güncellenebilir. Editlenmiş/untracked conflicting hedef varsa tüm plan yazımdan önce reddedilir.
- `--overwrite`: yalnız planlanan hedefleri açıkça değiştirir; init'i reset işlemine dönüştürmez. Otomatik merge veya edit kaybını gizleyen force default'u yoktur.
- Göreli güvenli path'ler, output root sınırı ve symlink ancestor/target kontrolleri vardır. Başka CLI yazarı `.bambiui.lock` ile engellenir.
- Dosyalar sibling temporary file + rename ile değiştirilir; caught failure'da rollback denenir. Bu **crash-atomic multi-file transaction değildir**. Proses kill/güç kesintisi sonrası lock ve çalışma incelenmelidir. CLI dışındaki eşzamanlı dosya yazarlarına karşı tam filesystem isolation iddiası yoktur.
- Registry response en fazla 8 MiB, source payload 128 dosya/5 MiB, yerel System dosyası 5 MiB, config 256 KiB. Catalog/manifest paths, source hashes, bytes, format/keys ve allowed dependencies doğrulanır. Eksik veri atlanarak partial install yapılmaz.
- Network yalnız registry GET'leridir. Yerel System JSON'u upload edilmez. Kaynak hash'i imza veya güvenilirlik kanıtı değildir; registry kodu uygulamada çalışacağı için yalnız güvenilir host seçilir.
- Google preset varsa üretilen CSS font import'unu korur; host Google'a IP/request bilgisi gönderir. Local font preset'leri Google isteği yapmaz.

## Yerel kullanım / test

Repo kökünde:

```sh
npm run registry:snapshot
npm run registry:build
npm run cli:build
npm run test:cli
npm run check:cli
npm run check:registry
npm run build
node scripts/generate-registry.mjs --check
node scripts/studio-source-smoke.mjs --screenshots
# Explicit public npm verification (requires network):
node scripts/check-cli-source.mjs --published --browser
```

Yerel geliştirmede CLI bin'i, React host'un cwd'sinden bu repodaki `packages/cli/bin/bambiui.mjs` dosyasının absolute path'iyle Node üzerinden çalıştırılabilir. `npm pack` ile üretilen yerel tarball `npm exec --package <local-tarball> -- bambiui ...` yolunu da destekler. Testler paketlenmiş CLI'yi repo/TypeScript/node_modules dışında ve yerel tarball üzerinden offline npm exec ile çalıştırır; gerçek npm yayını yapmaz.

`check:cli`, gerçek child-process init/add/theme çıktısını standalone React olarak type-check eder; ayrı Next tüketicisiyle build/prerender ve Chromium hydration, tema renkleri/ortak kesirli geometry/katman fontları, Input Error, choice controls ve narrow reflow'u doğrular. Kurulu bağımlılıklar tekrar kullanılır; temiz remote install veya tam görsel/erişilebilirlik kabulü değildir. Source/unit fixture'larını ana build ile paralel çalıştırma.

## Uygulama kanıtı · 2026-10-15

- 581 mevcut unit/SSR/source testi ve 16 ayrı CLI testi geçti. CLI child-process testleri init/add/theme, gerçek dependency closure, conflict/overwrite/idempotence/dry-run, pin/integrity/size/path/symlink/lock, shared parser/helper parity ve local snapshot privacy sınırlarını doğruladı. Testteki Node/React sürümleri kurulu baseline'dır; semver uyumluluğunun tüm kombinasyonları test edildi iddiası yoktur.
- Npm CLI manifesti `bambiui@0.2.0`, public access ve bin entry ile hazır. Gerçek `npm pack` tarball'ı repo/TypeScript/node_modules dışında init/add çalıştırdı; aynı yerel tarball `npm exec --offline --ignore-scripts --package ... -- bambiui --version` ile 0.2.0 döndürdü. Gerçek npm publish yapılmadı. Release gate'in onaysız/missing license ve bozuk compiled runtime'ı reddettiği test edildi.
- `npm run check:cli`: gerçek CLI çıktısı standalone React type-check, ayrı Next build/prerender ve Chromium Light/Dark hydration, Card.Title font size/weight/color, tek kenar/corner kesirleri, Input Error font size, readonly/error, native Switch/Checkbox ve 390px reflow kontrollerini geçti. Kurulu node_modules yeniden kullanıldı; C04 clean install değildir.
- Production build, registry/catalog freshness, TypeScript ve lint geçti. 97 System smoke kontrolü ve altı CLI/source browser senaryo grubu temiz exit ile geçti. Statik `out/registry` HTTP index/release hash/bytes ve actual clipboard komutu doğrulandı; sayfa açılışında registry/source fetch yok. ZIP fallback indirmenin tamamlanması native Browser.downloadProgress ile beklenir, ardından standard ZIP reader CRC/payload kontrolü yapar. Eski first-code-block varsayımı React usage marker'ıyla ayrıldı; testler CLI komut bloğunu React snippet sanmaz.
- 390px CLI preview screenshot'ı incelendi. Ayrı Project workspace/composer drag ve eski page-consumer browser scriptleri bu turda yeniden çalıştırılmadı. D02'de kaydedilen workspace process-exit timeout kabulü, manuel VoiceOver/native zoom/cross-browser ve public release kapıları açık kalır.

## MIT ve yayın denemesi · 2026-10-15

- CLI manifesti `license: MIT`; standart MIT LICENSE ve scope NOTICE pakete dahil. Compiler 14 saf runtime modülü üretir; private Studio source pakete girmez. CLI/init, registry ve manual export aynı lisans/notisleri taşır. Authored System JSON/token değerleri yeniden lisanslanmaz.
- Lisans kapsamı testi eklendi; collector/compiler yeni bir private dosyayı yanlışlıkla dağıtıma alamaz. MIT bildirimi olmayan/değişmiş registry ve bozulmuş build testleri yazımdan/yayından önce reddedilir.
- İncelenen `bambiui-0.2.0.tgz`: 24 dosya, 39.379 byte packed / 140.142 byte unpacked. Dosya seti yalnız bin/lib/dist ve package/README/LICENSE/NOTICE. İlk yayın isteği EOTP ile başarısızdı; kullanıcı sonrasında tamamladı. Yayın doğrulaması aşağıda kaydedilir. `.next/npm-release/` yalnız geçici staging alanıydı; Next build bu dizini silebilir. Kalıcı yayın kanıtı npm'deki immutable sürümün SHA-512 kaydıdır.

## Yayımlanan 0.2.0 doğrulaması · 2026-10-15

- Npm metadata: version `0.2.0`, license `MIT`, latest `0.2.0`, bin `bambiui`, Node `>=22.15.0`.
- Integrity: `sha512-kndjHpOjEC5SN7ZL17/lJo84jpiyV35cJKfZ0XEKNxC/P04HMagsMhV4bmbz5q7g8i9KW7SGxcdRpFwZ6LPdmw==`. İncelenen tarball ile birebir aynı.
- Boş/ayrı npm cache üzerinden public paketin --version ve --help komutları çalıştı. `node scripts/check-cli-source.mjs --published --browser`, yerel CLI yerine npm'deki 0.2.0 ile init/add/theme, standalone React tip kontrolü, ayrı Next build/prerender ve Light/Dark/katman fontları/geometry/Input Error/native choice/narrow reflow kontrollerini geçti.
- Yayın sonrası UI turunda 582 unit/SSR/source testi, production build, lint/TypeScript ve altı source/CLI browser senaryo grubu geçti. Mobil public CLI screenshot'ı incelendi; yayımlanan CLI dosyaları değiştirilmedi.
- Registry bu testte geçici yerel statik host'tu, production endpoint değildi. Host React/Base UI bağımlılıkları kurulu node_modules'tan yeniden kullanıldı; tam temiz dependency install veya manuel erişilebilirlik kabulü değildir.
- CLI 0.2.0 --help çıktısında eski “unpublished preview” cümlesi kalmıştır; sürüm/komutlar çalışır. Immutable 0.2.0 yeniden yayımlanmaz; bu yalnız metin düzeltmesi sonraki patch'e bırakılır.

## Retention ve 0.2.1 patch adayı · 2026-10-15

- Production index/release 200 JSON ve SHA-256/byte eşitliği doğrulandı. Npm 0.2.0 ile gerçek production init/add (yedi komponent + layout), Card closure, idempotence ve local fractional/Dark theme kontrolü geçti.
- İlk public release `f8c9659b67ea08923f7300577db326c63baa61cad3b04e9576ae0b10c945a709`, 210.376 byte olarak exact arşivlendi. Son production static build'in out/registry kopyası arşivle byte-byte aynı. Bu retention kodu henüz commit/deploy edilmedi.
- `npm run check:registry`: public npm 0.2.0 ile pin oluşturma → temiz output + future/incompatible latest → eski/yeni CLI ile eski pin'den add → local source değişikliğini koruma → 0.2.1 ile kesirli theme uygulama geçti. Fresh init uyumsuz latest'i reddetti. Simülasyon production registry'yi değiştirmez.
- 26 CLI/arşiv testi, 582 unit/SSR/source testi, standalone React ve Next build/browser consumer, son lint/TypeScript/production build ve registry freshness geçti. Consumer kurulu node_modules kullanır; clean dependency install ve manuel kabul açık.
- 0.2.1 tarball: 25 dosya, 40.627 byte packed / 143.232 byte unpacked; yalnız bin/lib/dist/package/README/LICENSE/NOTICE. MIT/runtime publication gate ve tarball üzerinden offline npm exec version/help geçti. SHA-512: `sha512-zSehso13Wox8C396f4vZb+bHGFp1yfzurxcI9S5KQMsRV28zdTRTAQXEU9e2tlNOopiTrHDsK0lU9EBxyj2axg==`.
- İncelenen paket `artifacts/npm/bambiui-0.2.1.tgz` altında (Git ignored, `.next` dışında). Maintainer eşleşti, npm latest hâlâ 0.2.0 idi; 0.2.1 yayın denemesi EOTP ile durdu. Kullanıcı kendi terminalinde `npm publish ./artifacts/npm/bambiui-0.2.1.tgz --access public --registry=https://registry.npmjs.org/` çalıştırarak npm browser/2FA akışını tamamlamalı. OTP/token sohbete konmaz. Metadata/integrity ve public consumer doğrulanmadan Develop pin'i değiştirilmez.

## Public 0.2.0 yayın kapısı

- Npm hedefi ve version hazırdır; Next root package private kalır. Paket `publishConfig.access=public`, bin entry ve yalnız gereken runtime/lib dosyalarıyla hazırlanır.
- Publish denemesi yapıldı: hesap mevcut package maintainer'ıyla eşleşti, 0.2.0 boştu; npm isteği 2FA/EOTP ile reddedildi. Kullanıcı yayını tamamladıktan sonra metadata/integrity ve public npm exec/consumer kontrolleriyle yayın doğrulandı. OTP/token sohbette paylaşılmaz; doğrulama kullanıcının kendi npm terminal/browser akışında yapılır.
- MIT kullanıcı tarafından onaylandı. CLI package ve `distribution-license.json` içindeki ortak kaynaklar MIT; tüm Studio değil. [Lisans kapsamı](licensing.md), root scope notice ve package LICENSE/NOTICE bunu ayırır. Registry/CLI kaynak grafiği allowlist ile kontrol edilir. `prepublishOnly` exact MIT notice, executable bin ve intact compiled resolver gerektirir.
- Üretim registry adresi, immutable release retention, temiz React/Next dependency install ve manuel kabul tamamlanmadan public CLI teslimatı tamamlandı denmez. Update/merge komutu ve frame source teslimatı ayrı sonraki işlerdir.
