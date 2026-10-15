# bambiui · System-first agent uygulama planı

Tarih: 2026-10-16. Ürün kapsamı için [roadmap](roadmap.md) önceliklidir. Bu belge agent görev dağılımıdır. A/B/C/D/E ilk uygulama dalgasında çalıştı; SF0 sözleşmesi donduruldu, SF1/SF2 ve generic matrix/inspector entegrasyonu doğrulandı. Kalan kabul/performance/storage işleri için [roadmap'in güncel kanıtı](roadmap.md#8-güncel-uygulama-kanıtı-ve-açık-kapılar) esas alınır; rol tanımları tüm manuel kapıların kapandığı anlamına gelmez.

## 1. Başlamadan önce

Her agent `AGENTS.md`, roadmap ve ilgili component/Base UI/Next rehberlerini okur. `git status` ile mevcut kullanıcı/diğer-agent değişikliklerini görür; onları revert etmez. Bu turda önceki clean-consumer/workspace-cleanup ve kabul dokümanı değişiklikleri bulunabilir. Unrelated refactor, dependency ekleme, commit, branch, publish/deploy yapılmaz.

İlk handoff **SF0 sözleşmesi** olmalı. A [docs/system-first-sf0-contract.md](system-first-sf0-contract.md) sözleşmesinin ilk yazıcısıdır; dosya ilk dalgada oluşturulup QA/koordinatör onayıyla donduruldu. A taslağı çıkarır; D taslağa göre baseline/test tasarımını sunar; A geri bildirimleri işler; kullanıcı/koordinatör freeze onayı verir. B/C implementasyonu ancak bu onaydan sonra başlar. SF0'ın kapanması için henüz uygulanmamış feature testlerinin geçmesi beklenmez; döngüsel bağımlılık kurulmaz.

Sözleşmede aşağıdakiler ve Card inspector taslağı (gruplar, empty selection, keyboard/focus, invalid draft/reset) bulunur:

- `/` ve `/colors` System Design / Colors; `/spacing`, komponent ve Develop route'larının korunması; `/pages[/]` ve `/examples/page-editor` askı ekranları. Ortak `(workspace)/layout.tsx` altında ikinci Studio mount edilmemesi. Unknown route/404, Back/Forward ve hydration sözleşmesi.
- Selection: mevcut component/recipe/part/frame-text hedefi, callback'ler ve sahip state. Yeni token anahtarı yok.
- Matrix filtresi seçimi gizlerse seçim/edit durumu, boş sonuç ve Clear davranışı; dış contrast seçimi filtreyi açarak gerçek hedefi görünür kılar. Pending valid/invalid draft, blur, reset ve focus için component/system/route/theme/filter değişim tablosu; eski taslak yeni hedefe uygulanmaz, implicit başka hedefe edit yok.
- Preview state sahibi/reset ömrü: system/component/recipe/part/theme/view/filter/close/reset/reload tablosu. System değişimi/reload temizler; canonical matrix axes/katmanlarını content/condition seçimleri gizlemez. Tek preview yolu; insertion defaults'a yazım yok. Saved defaults → matrix/ZIP örneği, session overrides → sadece preview, React API defaults → CLI kaynakları ayrımı ve Develop açıklaması.
- Sistem silme için index/registered document, missing/corrupt/inaccessible storage, partial/orphan key, storage event/focus refresh ve confirmation öncesi recheck. Boş index ile okunamayan index aynı değildir. Başka sekmenin unsaved session/history'sini okuyamama ve atomik olmayan localStorage sınırı açık.
- Askı ekranındaki read-only recovery indirmesinin key allowlist/byte limit/error ve gizlilik sözleşmesi. Ham kayıtlar kayıpsız saklanır; “tam Project bundle/import desteği” denmez. Recovery sırasında storage write/delete/upload yok; başka app key'leri toplanmaz. UI-only kesinti nedeniyle kullanıcı mevcut kayıtlarını dışarı alamaz hâle bırakılmaz.
- Module-local CSS ile global/shell CSS yazıcı sınırı. Dışarı açılan prop/type isimleri mevcut koddan türetilir; bu plan icat edilmiş API dayatmaz.

## 2. Doğrulanmış kod bağlantıları

| Alan | Başlangıç dosyaları / risk |
| --- | --- |
| Route/shell | `app/(workspace)/page.tsx`, `app/(workspace)/pages/page.tsx` null döner; `app/(workspace)/layout.tsx` her child'ın önünde Studio'yu mount eder. Gerçek ayrım `studio.tsx` içindeki `pathname === "/" || isComposerRoute(pathname)`, fallback selection `colors`. Yalnız page.tsx değiştirmek yetmez. |
| Composer mount | `studio.tsx` doğrudan `useComposer`, LayersPanel, ProjectManager/PageCanvas/ProjectInspector import eder. `systemDeletionBlock` composer controller'dan gelir. Hook'u körlemesine silmek veri güvenliğini bozar. |
| Project yolları | `app/studio/composer/workspace-route.ts`, `composer/project-ui.tsx`, `app/examples/page-editor/page.tsx`; production direct URL davranışı ayrıca test edilir. |
| Inspector | `app/studio/system-component-editor.tsx`, `.module.css`, `.test.mjs`; rendered-appearance, style-sources, component-styles/recipes mevcut motor. |
| Matrix | `app/studio/component-matrix.tsx`, `.module.css`, `.test.mjs`; 294 kayıt korunur. |
| Preview | `app/studio/preview.tsx` matrix'in parent'ıdır; `interaction-preview.tsx`, `.module.css`, `.test.mjs` gerçek state denemesini yapar. Matrix ve interaction ikisi de `componentDefaults` okur; yeni session props'un akışı parent entegrasyonu gerektirir. |
| Teslimat | `app/studio/source-download-panel.tsx`, `developer.tsx`, `source-delivery.ts`, `scripts/studio-source-smoke.mjs`, `scripts/check-cli-source.mjs`, `packages/cli`; ZIP `componentDefaults` → `createComponentNode` → PageDocument üretir ve layout toplar. Project kapansa da ortak engine/source grafiği silinmez. |
| Exact anatomy | `app/studio/components/recipes.ts`: Button/Badge `root,text`; Card `root,header,title,description,content,footer,icon`; field/choice parts conditional. Button icon exact part değildir. Toplam 294; Text 180. |
| System persistence | `app/studio/systems.ts`: authoritative collection ve legacy mirror; mevcut save'in iki-sekme CAS/transaction sağladığı varsayılmaz. SF0 risk envanteri, A sınırlı düzeltme, D hata/çatışma testleri. |
| Legacy test | `scripts/studio-workspace-smoke.mjs`, composer/page-document unit testleri; eski public girişler askıya alınınca yeni System-only smoke gerekir. |

Bunlar başlangıç noktalarıdır. Listede olmayan mevcut dosya değişikliği gerektiğinde önce owner'a bildir; kendiliğinden write set genişletme.

## 3. Agent A — Route, shell ve entegrasyon sahibi

**Görev:** SF0 sözleşmesini çıkar; SF1 System-only girişini uygula. B/C'nin hazır component API'lerini shell/preview'a bağla; SF4 sonrası ikinci entegrasyon turunu ve SF5'te gereken System persistence düzeltmesini sahiplen.

**Write set:** `docs/system-first-sf0-contract.md` (yeni); `app/(workspace)/` route/layout dosyaları, `app/studio/studio.tsx`, `app/studio/preview.tsx`, `app/studio/preview.module.css`, `app/studio/composer/workspace-route.ts`, `app/studio/composer/workspace-shell.module.css`, `app/examples/page-editor/page.tsx`; yeni salt-okunur referans/recovery adapter'ı ve unit testi. Entegrasyon/iletişim dosyaları `app/studio/developer.tsx`, `developer-copy.ts`, `source-download-panel.tsx`, `README.md` ve `package.json` da tek yazıcı A'dadır. `systems.ts`/ilgili unit testleri A'nın SF5 alt dilimidir; planı D ile netleşmeden storage refactor yok. Global CSS, app metadata/manifest/help dosyalarının tam listesi SF0 envanterinde A'ya tahsis edilir. Composer model/storage değişikliği gerekiyorsa önce kapsamı belgeleyip koordine et.

**Yapılacak:**
1. Public Project CTA/link/route envanteri ve read/write storage envanteri çıkar.
2. System'i `/` varsayılanı yap, Project switch/manager/authoring UI'yı kaldır; shared layout dahil `/pages[/]` ve page-editor için tek static-export uyumlu askı ekranı. Eski authoring'in query/env bayrağıyla public açılmasına izin verme.
3. Project runtime'ı normal System açılışında mount etme. Legacy system deletion referanslarını salt okunur ve güvenli şekilde koru; her render'da büyük belge parse etmekten kaçın. SF0 sözleşmeli ham recovery indirmesini sadece askı ekranındaki açık kullanıcı eylemine bağla. Project authoring/bundle import özelliği ekleme.
4. Deep link, reload, Back/Forward, Design/Develop, system selector/theme/history ve narrow-panel davranışını koru.
5. B/C entegrasyonunu yalnız onların handoff'u sonrası yap; `preview.tsx` ve Develop data akışı atlanmasın. README/public metadata/help'in Project-first vaatlerini güncelle, transient preview vs saved export farkını açıkla. SF4 sonunda aynı entegrasyon kapısını yeniden çalıştır.
6. SF0 envanterindeki System storage güvenliği eksiklerini dar kapsamda planla; SF1'in yarattığı veri riski varsa SF5'i beklemeden düzelt. D test yazar/koşar; storage implementation ve mevcut unit testlerinin tek yazıcısı A'dır.

**Kabul:** SF1 checklist; eski Project kayıtlarının byte-byte korunması ve recovery dosyasında kayıpsız ham değerler; invalid refs güvenli silme engeli/confirmation recheck; root'ta tek hydrated System; askı URL'sinde çift shell/gizli composer olmaması; direct authoring erişiminin kapanması; static build. Data safety için rollback yeni verileri bozmayacak mı ayrıca kaydet.

**Yapma:** storage key silme, migration, component recipe/schema değişikliği, composer dosyalarını toplu silme, npm release.

## 4. Agent B — Inspector / Card pilotu

**Önkoşul:** A'nın SF0 selection/preview sözleşmesi. A shell'i düzenlerken yalnız ayrılmış component dosyalarında çalışabilir.

**Write set:** `app/studio/system-component-editor.tsx`, `system-component-editor.module.css`, `system-component-editor.test.mjs`; yeni inspector-only alt dosyalar. `app/studio/interaction-preview.tsx`, `interaction-preview.module.css`, `interaction-preview.test.mjs` de B'nin tek-yazıcı alanıdır: SF2'de gereken session-preview arayüzü, SF4'te state/anatomy uyarlaması. C bu dosyaları çağıran matrix'i yazar, içlerini düzenlemez.

**Görev:** SF2 Card pilotu. Mevcut field/resolver kontrollerini yeniden grupla; frame/text anlamını netleştir; scope/reset/effective value/precision/validation koru. Insertion-default UI'yı görünür ana akıştan çıkar; eski `componentDefaults` parser/export/storage davranışını değiştirme. Önizleme seçenekleri yalnız session state.

**Kabul:** exact outlined.md title ve root örneği; diğer recipe/katmanlar sabit; shared/base ayrı; null selection açık; draft/blur hedef değişimi, invalid reset/undo, no-op ve fractional değer testleri. Foundations/contrast alanlarına erişim kaybolmaz; dar inspector'da help/error görünür; klavye focus kaybı yok. Preview props kaydedilmiş defaults'u veya export'u değiştirmez; Button için icon gibi olmayan exact part yaratılmaz.

**Yapma:** `studio.tsx` veya matrix dosyalarını doğrudan düzenleme, token key ekleme, tüm kontrol tiplerini yeniden yazma. Gerekli shell prop/callback değişikliklerini A'ya handoff et.

## 5. Agent C — Matrix / seçim ergonomisi

**Önkoşul:** SF0 selection/filter sözleşmesi. B ile aynı callback/selection anlamı.

**Write set:** `app/studio/component-matrix.tsx`, `component-matrix.module.css`, `component-matrix.test.mjs`; yeni matrix-only alt dosyalar. Canvas ortak hook/CSS ihtiyacını A'ya bildir; shared dosyada yarışma.

**Görev:** SF3. Default tüm kombinasyonları erişilebilir tut; okunabilir axis/grup başlıkları, exact selection, keyboard layer alternatifi ve opsiyonel filtre/clear/selection focus. 180 Text örneğini profille; ölçmeden renderer/virtualisation rewrite yapma.

**Kabul:** 294 recipe listesi aynı; UI filtre state'i kayıt/history üretmez; gizlenmiş selection'a veya blur sonrası yeni hedefe eski draft gitmez; dış contrast hedefi görünür olur. Pointer ve keyboard aynı hedefi seçer; design hit-target ile live preview ayrılır. Filtrelenmiş/aria-hidden örneklerde tabbable kontrol yok; disabled örnek layer selector ile seçilir. Pan/fit ve panel değişimi scope'u bozmaz; küçük ekranda controls erişilebilir.

**Yapma:** inspector field düzenleme, insertion defaults/token mutation, production routing veya Figma kit kodu.

## 6. Agent D — Bağımsız QA ve yeni kabul

**İlk dalga:** A/B/C'yi beklemeden eski testlerdeki Project varsayımlarını ve coverage kaybı riskini read-only raporla. A'nın SF0 taslağı hazır olunca aynı dalga içinde baseline/fixture tasarımını ve kabul belgelerinin uyarlamasını yap; SF0'ın kapanmasını beklemek zorunda değilsin. Freeze sonrası yeni test kodunu yaz; feature henüz yokken başarısızsa “beklenen, feature bekleniyor” raporla, skip ile yeşil gösterme.

**Write set:** yeni `scripts/studio-system-only-smoke.mjs` ve ona özel fixture/test dosyaları (önerilen yeni dosyalar); `docs/studio-acceptance.md`, `docs/accessibility-checklist.md`. Mevcut `scripts/studio-smoke.mjs`, `scripts/studio-source-smoke.mjs`, `scripts/studio-workspace-smoke.mjs`, `scripts/studio-composer-smoke.mjs`, `scripts/page-editor-smoke.mjs` uyarlaması/kapsam işaretleri entegrasyon dalgasında tek yazıcı D'ye devredilir; yeni public route gerektiren legacy fixture default export'a eklenmez. `package.json` komutlarını ve README test yönergelerini A ekler. A/B/C'nin mevcut unit dosyalarını D değiştirmez; bulguyu owner'a verir veya ayrılmış yeni test yazar.

**Görev:**
- Root/old URL/unknown URL/static export smoke; ortak layout'ta çift Studio olmadığını, keyboard focus ve Back/Forward'ı kontrol et. Storage'a eski Project fixture'ı koyup açılış/tema/navigation/reset sonrası Project bytes değişmediğini ve recovery indirmenin allowlist/raw bytes/privacy davranışını doğrula. Bu test kontrollü fixture'dır, insan kullanımı kanıtı değil.
- Bağlı/bozuk/missing/unreadable/partial-orphan referanslarda sistem silme koruması; başka sekme yazımı sonrası pre-delete recheck; boş store/no-op/hydration kontrolü. System save quota/throw, import rejection ve stale-tab senaryolarını ayrı test et; bunlar zaten çalışıyor varsayma. A düzeltmenin implementation sahibidir.
- Exact root/text scope, Card/Input/Button ve kalan dört komponentin kritik katmanları; filter/contrast selection, pending draft/focus ve preview sıfır-write. Preview değişimleri sonrası saved System CSS/JSON/ZIP semantic eşitliği ve CLI React defaults'unun değişmemesi; snapshot capture sırasında navigation da kapsansın.
- Her eski Project UI browser senaryosunu System-only'a taşındı / legacy model testiyle korunuyor / authoring askıda olarak etiketle. Yeni spec ile uyuşmayan script'i varsayılan gate'ten ayırırken dormant scope/çalıştırma önkoşulunu yaz; koşul yoksa çalışırmış gibi sunma. Sessiz skip veya toplam test sayısını başarı kanıtı yapma.
- Güncellenmiş System-only kabul protokolünü SF0/gerçek UI ile eşleştir; T/A task ID'lerini SF2–SF5'e bağla. Eski Project protokolü tarihsel kayıttır; yeni görevler preview ve export/import üzerindendir. Tüm gözlenmemiş manuel sonuçları not run bırak; insan oturumunu agent testiyle ikame etme.

**Kabul:** feature sonrası gerçek browser exit=0, scoped fixtures ve storage bytes assertion; manuel/otomatik kanıt ayrımı; screenshots varsa çekilmiş mi incelenmiş mi ayrı yazılı.

## 7. Agent E — Figma sözleşmesi (şimdilik araştırma/doküman)

**Paralel başlanabilir:** SF6.1. Kod değişikliği yok.

**Write set:** yeni `docs/figma-kit-contract.md`; gerekiyorsa bu dokümana ait eşleme tabloları. Roadmap ve component-api'yi değiştirme; çelişkiyi raporla.

**Çıktı:**
- Yedi komponentin mevcut gerçek API/recipe/part envanteri; her biri için Figma property/layer/variable/style karşılığı ve uyumsuzluklar.
- Light/Dark colors vs shared typography/geometry; per-size/per-part overrides, fractional values, auto layout ve Card compound anatomy.
- Card pilot planı ve web ↔ Figma karşılaştırma matrisi. Focus/loading/native form semantiğinin Figma'da ne kadar temsil edilebildiği açık.
- Standart kit ile kullanıcı System JSON aktarımı arasındaki fark. İlk aşamada manuel mapping rehberi; plugin/REST API seçenekleri için güncel resmi doküman, tarih, izin/plan/network/maliyet sınırları. Araştırılmamış API kabiliyeti varsayma.
- Gerçek `.fig`/Community teslimatı, authoring hesabı/erişimi, font/icon/asset hakları, kit lisansı/attribution ve versiyonlama için gereken kararlar.
- Pilot ve kit için ayrı kabul tabloları: pilotta Card; kit'te yedi komponent + foundations, iki tema/shared değerler ve gerçek import/duplicate/edit denemesi. Aynı code/API/registry hash/System snapshot kimliğiyle eşle; SF4 değişirse erken araştırmayı revalidate et, yalnız CLI semver'ini kit sürümü sanma.

**İnsan/tool handoff:** E araştırma raporu verir → kullanıcı kit sahibi/tasarımcı ve inceleyeni atar, paylaşım/lisansı onaylar → gerçek authoring aracı veya manuel Figma oturumu erişimi doğrulanır → Card pilotu → kit inceleme/teslimat. Bunlar E'nin doküman görevinin otomatik devamı değildir. Erişim veya sahip yoksa SF6.2 blocked kalır; SF5 sonrası SF7'yi başlatıp başlatmama kararı ayrıca kullanıcıya aittir.

**Yapma:** sahte Figma dosyası/linki, tamamlanmış kit iddiası, otomatik sync vaadi, token/secret isteme, uygulamaya placeholder kit indirme düğmesi ekleme.

## 8. Dalga planı ve dosya çakışmaları

| Dalga | Çalışabilir | Bekleyen |
| --- | --- | --- |
| 0a | A: SF0 taslağı; D: read-only coverage; E: mapping araştırması | B/C implementasyonu |
| 0b | D: taslağa baseline/task/fixture review; A: sözleşme revizyonu; koordinatör: freeze | Freeze öncesi feature kodu |
| 1 | A: SF1; B: SF2; C: SF3; D: yeni bağımsız testler; E: doküman | Entegre kabul |
| 2 | A: SF1+SF2+SF3 entegrasyonu; D: mevcut smoke adaptasyonu ve seri validation | SF4 genişleme |
| 3 | B: yedi komponent inspector/preview; C: matrix-only uyarlama; A: SF4 parent/Develop entegrasyonu ve gerekli System storage düzeltmesi; D: regresyon | Entegre SF4 kabulü öncesi SF5 |
| 4 | SF5 otomatik+insan kabulü; E: eşlemeyi yeni baseline'a bağlama | Kullanıcı kararı olmadan yeni komponent / Figma authoring |
| 5 | Kullanıcının önceliğine göre SF6 kit ve/veya SF7; gerçek Figma sahibi/tool devri ayrı | Otomatik kit/publish/sync iddiası |

`studio.tsx`, `preview.tsx`, global CSS, `package.json`, shared schema/resolver ve public component dosyaları **paylaşımlı serbest edit alanı değildir**. A'nın entegrasyon sahipliği shared token/public component koduna sınırsız edit yetkisi vermez; API/fingerprint etkisi varsa ayrı kapsam onayı gerekir. Agent shared dosya ihtiyacı bulursa owner'a küçük patch önerisi ve testi iletir. Agent'lar roadmap checkbox'larını bağımsız değiştirmez; koordinatör kanıta göre günceller.

### Ortak dosya ve validation sahipliği

| Yüzey | Tek yazıcı / sorumluluk |
| --- | --- |
| SF0 kontrat dosyası | A; D review, koordinatör freeze |
| Studio + Preview parent, foundation/contrast navigation, metadata/help/global CSS | A; B/C ihtiyaçlarını patch/handoff olarak verir |
| Inspector + interaction preview | B; parent callback/state bağlantısını A yapar |
| Matrix/rendered hit targets | C; B'nin preview arayüzünü yalnız tüketir |
| Develop, README, package komutları | A; D doğrular |
| System storage implementation/mevcut unit testleri | A; D ayrı integration/error senaryoları |
| Ortak browser scriptleri, aktif kabul dokümanları | D; feature unit dosyalarına eşzamanlı yazmaz |
| Roadmap/status ve cross-agent tahsis değişiklikleri | Kullanıcı/koordinatör |

**Validation yazım kilidi:** D tek çalışma ağacında komut sırasını yönetir; A kabul edilecek entegrasyon revizyonunu sabitler. `build`, `source:catalog`, `registry:build`, `cli:build`, `test:cli`, `check:cli`, `check:registry` ortak generated alanları değiştirebilir: `.next`, `out`, `public/bambiui-source`, `public/registry`, `app/studio/source-catalog-meta.json`, `packages/cli/dist`. Bunları paralel çalıştırma; yalnız source dosyaları ayrı diye güvenli sayma. Fixture yazan unit testler de aynı kilide dahildir. Ağır browser testlerini seri çalıştır; gerçek izolasyon varsa bağımsız saf testler paralel olabilir. Final test sırasında ilgili source/metadata edit edilmez.

### Kabul → kanıt eşlemesi

| Kriter | Kanıt / sahibi | Kapı |
| --- | --- | --- |
| Root/direct route/404, tek shell, Project kapalı | Yeni System-only smoke: D; route fix: A | SF1 |
| Legacy bytes + recovery allowlist/hata; deletion recheck | Read-only adapter unit: A; controlled storage/browser fixture: D | SF1 |
| Card exact/shared ve pending draft/reset/focus | Editor unit: B; matrix unit: C; entegre browser: D | SF2/SF3 |
| Yedi komponent anatomy/state/contrast navigation | B/C unit + D System smoke; A parent/Develop bağlantısı | SF4 |
| System import/storage quota/stale-tab | A persistence unit + D bağımsız integration; kayıpsız recovery kanıtı | SF5 (yeni data-risk SF1'i de bloklar) |
| Preview kaydedilmez/export snapshot aynı | D source browser; mevcut CLI/unit consumer'ı D seri çalıştırır | SF2/SF4/SF5 |
| User/keyboard/VoiceOver/native zoom | Aktif protokol T01–T06/A01–A06; D hazırlar, gerçek katılımcı/insan test eden çalıştırır | SF5 |
| Figma pilot/kit | E sözleşme; atanmış tasarımcı üretir, atanmış inceleyen gerçek dosyayı test eder | SF6.2 / SF6.3 ayrı |

A, yeni `scripts/studio-system-only-smoke.mjs` gerçekten oluşturulunca komutunu `package.json` ve README'ye ekler; roadmap validation listesindeki karşılığını güncellemesi için koordinatöre handoff verir. D üç yerdeki tutarlılığı, testin kapsamını ve temiz exit'ini doğrular; olmayan komutu çalıştı diye raporlamaz. Eski kullanıcı/erişilebilirlik sonuçları yeniden tarih atılarak bugünün kanıtı yapılmaz.

## 9. Agent'a verilecek ortak prompt

> `docs/roadmap.md` ve `docs/system-first-execution-plan.md` içindeki Agent [A/B/C/D/E] görevini yürüt. Önce AGENTS.md ve görevle ilgili mevcut kodu oku. Yalnız atanmış write set içinde çalış; başka agent/kullanıcı değişikliklerini geri alma. Project kodu/verisini silme; System-only ürün kararıyla API/schema/token invariants'ını koru. Henüz başlanamayacak bağımlılık varsa read-only analiz ve somut handoff üret, varsayımsal API üzerinden kod yazma. İlgisiz refactor/dependency/commit/publish/deploy yapma. Sonuçta değişen dosyalar, uygulanan kabul ölçütleri, çalıştırılan testler ve gerçek çıktıları, manuel kalanlar ve entegrasyon sahibine gereken prop/callback değişikliklerini bildir.

## 10. Handoff şablonu

```text
Görev / SF ID:
Durum: analiz / uygulandı-doğrulanmadı / doğrulandı / bloke
Değişen dosyalar:
Davranış farkı:
Korunan storage/API/token sınırları:
Test komutu → sonuç (çalışmadıysa nedeni):
Manuel doğrulama / yapılmayanlar:
Diğer agent'a gereken interface veya patch:
Risk / geri dönüş:
Sonraki bağımlılık:
```

“Bitti” ancak kendi kapsamının kanıtı varsa kullanılır. Feature kodu yazmak, kullanıcı kabulünü veya deploy'u otomatik tamamlamaz.
