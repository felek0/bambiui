import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../studio/icons";
import cli from "../../packages/cli/package.json";
import { CopyCommand, HeroSpec, LandingDemos } from "./_landing/demos";
import { RoadmapBoard } from "./_landing/roadmap-board";
import { landingFont } from "./_landing/fonts";
import styles from "./_landing/landing.module.css";

export const metadata: Metadata = {
  title: "bambiui — design systems on the components you ship",
  description: "Turn one brand color into Light and Dark themes, tune tokens on real React + Base UI components, then copy the source into your app with npx.",
};

const sections = [["color", "Color"], ["tokens", "Tokens"], ["export", "Export"], ["cli", "CLI"], ["roadmap", "Roadmap"]] as const;

export default function LandingPage() {
  return <div className={`${styles.page} ${landingFont.variable}`}>
    <a className={styles.skip} href="#main">Skip to content</a>
    <header className={styles.header}>
      <div className={`${styles.wrap} ${styles.headerInner}`}>
        <Link href="/" className={styles.wordmark} aria-label="bambiui home"><BrandMark size={18} />bambiui</Link>
        <nav className={styles.nav} aria-label="Sections">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          <a href="https://github.com/felek0/bambiui" rel="noreferrer" target="_blank">GitHub</a>
        </nav>
        <Link href="/colors" className={styles.button}>Open Studio</Link>
      </div>
    </header>
    <main id="main">
      <section className={`${styles.wrap} ${styles.grid} ${styles.hero}`} aria-labelledby="hero-title">
        <h1 id="hero-title">Design your system on the components you ship.</h1>
        <div className={styles.heroText}>
          <p>bambiui is a design-system studio for React and Base UI. Turn one brand color into Light and Dark themes, tune tokens on the real components, then copy the source into your app with npx.</p>
          <div className={styles.heroActions}>
            <Link href="/colors" className={styles.button}>Open Studio</Link>
            <CopyCommand command={`npx bambiui@${cli.version} init`} />
          </div>
        </div>
        <div className={styles.heroFigure}><HeroSpec /></div>
      </section>
      <LandingDemos cliVersion={cli.version} />
      <RoadmapBoard fontClassName={landingFont.variable} />
    </main>
    <footer className={styles.footer}>
      <div className={`${styles.wrap} ${styles.footerInner}`}>
        <span className={styles.wordmark}><BrandMark size={16} />bambiui</span>
        <span>Component sources and the CLI are MIT-licensed.</span>
        <span className={styles.footerLinks}>
          <a href="https://github.com/felek0/bambiui" rel="noreferrer" target="_blank">GitHub</a>
          <Link href="/colors">Open Studio</Link>
        </span>
      </div>
    </footer>
  </div>;
}
