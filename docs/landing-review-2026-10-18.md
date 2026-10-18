# bambiui · Landing kabul kaydı

Tarih: 2026-10-18. Kapsam: mevcut landing tasarımını ve etkileşimlerini koruyarak responsive taşma, görsel tutarlılık ve yerel roadmap kayıt davranışını doğrulama. Önceden commit edilmemiş landing/route çalışmaları korunmuştur. Commit, publish veya deploy yapılmadı.

Kurulu sürümler: Next.js 16.3.6, React/React DOM 19.2.8, `@base-ui/react` 1.8.0, Tailwind CSS 4.3.3, TypeScript 5.9.3. Yerel CLI manifesti 0.2.1; private uygulamanın 0.1.0 sürümü bununla aynı sürüm ekseni değildir.

## Mobil taşmanın kök nedeni

390px mobil Chromium'da `documentElement.clientWidth = 390`, `scrollWidth = 619`, `body.scrollWidth = 618`, `innerWidth = 619`, `visualViewport.width = 390` ölçüldü. Dolayısıyla yalnız `scrollWidth <= innerWidth` veya `rect.right > innerWidth` kontrolü hatayı kaçırabiliyordu.

Paletin görünmez ekran okuyucu metinleri absolute konumlandırılmıştı; kaydırma alanı positioned olmadığı için dış containing block'a bağlanıyor ve belgenin scrollable overflow alanını büyütüyordu. `.tableRegion { position: relative }` bu metinleri doğru scroller'a bağlar. Aynı DOM'da bunu eklemek belgeyi 390px'e indirdi, kaldırmak taşmayı geri getirdi. **Belgeye `overflow-x: hidden/clip` eklenmedi.** Palet kendi içinde klavye ve pointer ile yatay kaydırılabilir; rol başlıkları sabit kalır.

## UX ve davranış değişiklikleri

- 641px'de taşan header için kompakt navigasyon sınırı düzeltildi.
- Mobil token kontrolleri iki sütuna, tablet kontrolleri boş dekoratif hücre bırakmayan 3 + 2 düzenine geçti; örnek komponentlerin kendi layout'u değiştirilmedi.
- Paletteki renk hedefleri büyüdü; mobilde rol adı sütunu daraldı. Desktop'ta renk basamakları bölüm başlığıyla aynı eksende kalır.
- Uzun CLI komutları, export başlığı ve kullanıcı önerileri kendi alanında kırılır. Boş durum/uyarı alanları aksiyonların altında yapay boşluk oluşturmaz.
- Landing focus stilleri gerçek `data-ds-theme` örneklerinin focus ring'ini ezmez; Dark'ta komponentin kendi erişilebilir focus rengi/geometrisi tüketilir.
- Hero'nun mevcut `data-spec-probe` 1× ölçümü ve `data-spec-view` %175 görünümü korundu. Radius, padding, block-size ve font-size değerleri gerçek DOM ile, dikey redline konumu/boyu görünür örnekle karşılaştırılır.
- Roadmap önerileri **yalnız bu tarayıcıda** saklanır; bu sınır popup öncesinde, New sütununda ve formda açıktır. Merkezi gönderim iddiası yoktur.
- Storage erişim/kota hataları görünür hata verir; başarısız silme öğeyi tutar ve başarı mesajı üretmez. Okunamayan veya henüz işlenmemiş başka-sekme değişikliği içeren raw kayıtlar üzerine yazılmaz. Bu kontrol atomik çok-sekme garantisi veya System storage için SF5 çözümü değildir.

## Tekrarlanabilir kontroller

```sh
npm run build
npm run test:landing -- --screenshots
node --test --test-concurrency=1 'app/(landing)/_landing/landing.test.mjs' app/studio/*.test.mjs app/studio/composer/*.test.mjs app/studio/page-document/*.test.mjs app/examples/page-editor/*.test.mjs
npm run lint
npx tsc --noEmit --incremental false
```

Landing smoke kendi build'ini başlatmaz. Disposable Chromium profili ve yerel statik host kullanır; ekran görüntüleri `--screenshots` ile `.next/landing-review/` altında yeniden üretilir. 390, 900 ve 1440px ekran görüntüleri görsel olarak incelendi; piksel-regresyonu veya insan kullanıcı kabulü değildir.

| Kontrol | Bu oturumdaki sonuç |
| --- | --- |
| Landing unit/handler testleri | 15/15 |
| App unit/SSR/browser içeren seri suite | 733/733; skip yok |
| Landing Chromium | 27/27; 320–1920px 16 viewport, Light/Dark ve font/token uç değerleri, hero ölçümü, palet yerel kaydırma, JSON/CSS indirme, CLI kopyalama, dialog focus/Escape/Cancel, storage hata/bozuk kayıt, 320×480 ve reduced motion |
| Studio smoke | 127/127 |
| Playground smoke | 22/22 |
| System-only smoke | 18/18 |
| Source/CLI/JSON browser | 8 PASS checkpoint |
| Browser process testleri | 5/5 |
| Yerel CLI unit testleri | 26/26 |
| Yerel CLI consumer | Standalone type-check, ayrı Next build/prerender ve Light/Dark browser kontrolleri geçti; kurulu bağımlılıklar yeniden kullanıldı |
| TypeScript / ESLint / production static build | Geçti |
| Source catalog / registry freshness | Geçti; 211614 / 213427 byte, 2 generated retained release |
| Registry retention | **Başarısız**, aşağıdaki yayın kapısı açık |

İlk varsayılan-paralellik app koşusunda `component-recipes.test.mjs` içindeki “recipe border zero must not erase keyboard focus” kontrolü başarısızdı. İzole dosya koşusu 14/14, sonraki tam seri koşu 733/733 geçti. Zamanlama/concurrency duyarlı olma ihtimali var; neden kesinleştirilmedi ve ilgisiz test/kod değiştirilmedi. `MODULE_TYPELESS_PACKAGE_JSON` uyarıları mevcut, hata değildir.

## Açık kapılar

- `npm run check:registry`: published 0.2.0 arşivden init/add yaptıktan sonra yerel 0.2.1 `add card`, `scripts/check-registry-retention.mjs:60` noktasında **“This project requires the matching CLI theme resolver; no automatic registry upgrade was attempted.”** hatasıyla durdu. Ağ reddi değildi. Yerel CLI + yeni geçici registry consumer testinin geçmesi bu hatayı kapatmaz.
- Yerel generated registry ve resolver kendi içinde tutarlı; mevcut kaynak resolver'ı saklanan önceki 0.2.1 tarball resolver'ından farklı. Güncel release'in generated çıktıda bulunması tracked `registry/releases.json` içinde kalıcı arşivlendiği anlamına gelmez. Yeni yayın/deploy öncesi sürüm/resolver eşleştirmesi ve retention ayrıca çözülmeli; bu landing diliminde sürüm, dağıtılan komponentler veya arşiv değiştirilmedi.
- Canlı npm latest / production site ve `check:cli:clean` bu oturumda yeniden doğrulanmadı. Yerel komut/sürüm metadata'sı canlı dağıtım kabulü değildir.
- VoiceOver, native %200 browser zoom, gerçek dokunmatik cihaz ergonomisi, Safari/Firefox ve kullanıcı görev kabulü açık. Emüle viewport/klavye testleri bunların yerine geçmez.
- Roadmap backend/GitHub Issues entegrasyonu yok; bozuk yerel öneriler için otomatik onarım veya veri silme yok. Project composer askıda kalır; token v3, tema/scope, undo ve public API değişmedi.
