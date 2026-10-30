import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Box, FileText, Search, Upload } from "lucide-react";
import Button from "@/components/brand/Button";
import Mark from "@/components/brand/Mark";
import NetworkBoard from "@/components/brand/NetworkBoard";
import ProviderLogo from "@/components/ProviderLogo";
import "@/app/brand.css";
import "@/app/landing.css";

const services = [
  { id: "chutes", name: "Chutes", label: "Write & reason", sn: 64 },
  { id: "desearch", name: "Desearch", label: "Search the web", sn: 22 },
  { id: "404gen", name: "404-GEN", label: "Create in 3D", sn: 17 },
  { id: "attelier", name: "Attelier", label: "Make media", sn: 126 },
  { id: "hippius", name: "Hippius", label: "Store your files", sn: 75 },
  { id: "saygm", name: "SayGM", label: "Ask anything", sn: 28 },
] as const;
const faqs = [
  ["What is Subswarm?", "A place to discover and use Bittensor services. Choose a subnet, send instructions or a file, and find the output in your library. You can work in the app or explore the same services in a pixel village."],
  ["Do I need to connect a wallet?", "You can browse services and read the supported testnet registries without one. Paid requests use a connected Substrate wallet and a prepaid test-TAO balance when payments are enabled. The wallet shows the receiver and amount before you approve a deposit."],
  ["How do requests and payments work?", "Review the quote before sending. Subswarm reserves the quoted balance and charges it only after the result is saved. Failed requests release that reservation. Provider credits are managed by Subswarm, and availability depends on each provider's connection and credits."],
  ["Are all services available inside Subswarm?", "The app shows which integrations are configured, unavailable or external. EveryFrame and Ridges open their own studios. A connected integration still depends on provider availability and credits when a request runs."],
  ["Are the villagers real miners?", "Labelled residents represent participants from a subnet's public registry. Moving couriers illustrate a request, not a miner competition. We identify a responding miner only when the provider returns evidence for that particular request."],
  ["Is this on testnet?", "Wallet deposits and balances in this build use test TAO. Some hosted AI APIs serve mainnet subnets and may consume real provider credits. The app does not send mainnet transactions. A provider API and a chain's testnet are different systems."],
];

function VillageEntry() {
  return <Link href="/village/" className="village-entry pixel">
    <span className="village-entry-sparks" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span>
    <span className="village-entry-face">
      <svg className="village-entry-door" viewBox="0 0 20 24" aria-hidden="true" shapeRendering="crispEdges">
        <path fill="#342365" d="M4 0h12v4h4v20H0V4h4z" />
        <path fill="#9f8bf0" d="M4 4h12v16H4z" />
        <path className="village-entry-light" fill="#f4dcff" d="M8 4h4v4H8zM4 12h4v4H4zM12 16h4v4h-4z" />
        <path fill="#ffe53b" d="M0 20h20v4H0z" />
      </svg>
      <span>Enter village</span>
      <svg className="village-entry-arrow" viewBox="0 0 12 12" aria-hidden="true" shapeRendering="crispEdges"><path fill="currentColor" d="M4 0h2v2h2v2h2v4H8v2H6v2H4v-2h2V8h2V4H6V2H4z" /></svg>
    </span>
  </Link>;
}

export default function Landing() {
  return <div className="swarm-brand landing">
    <a className="skip-link" href="#landing-main">Skip to content</a>
    <header className="landing-header"><Link href="/" className="swarm-wordmark"><Mark />SUBSWARM</Link><nav aria-label="Main navigation"><a href="#explore">Subnets</a><a href="#how-it-works">How it works</a><a href="#two-worlds">Two ways in</a><a href="#faq">FAQ</a></nav><Button href="/app/">Open app</Button></header>
    <main id="landing-main">
      <section className="landing-hero"><NetworkBoard /><div className="hero-shade" aria-hidden="true" /><div className="hero-copy"><p className="pixel hero-kicker">Built with Bittensor</p><h1 className="display">One world.<br /><span>Many minds.</span></h1><p className="hero-lede">Discover and use Bittensor&apos;s AI services.</p><div className="hero-actions"><Button href="/app/">Open app</Button><VillageEntry /></div></div></section>
      <div className="brand-ticker" aria-hidden="true"><span>ASK SOMETHING</span><i /><span>MAKE SOMETHING</span><i /><span>FIND SOMETHING</span><i /><span>MEET THE NETWORK</span></div>
      <section id="explore" className="landing-explore landing-section"><div className="section-intro"><div><span className="brand-label">The subnet directory</span><h2 className="display">Find your<br /><span>next superpower.</span></h2></div><p>Different networks. Different skills.<br />Pick the service that fits your idea. The workspace shows connection status, inputs and outputs before you begin.</p></div><div className="landing-services">{services.map((service, i) => <Link href={`/app/?subnet=${service.id}`} key={service.id} className="landing-service"><span className="pixel service-index">0{i + 1} / SN {service.sn}</span><ProviderLogo id={service.id} size={48} /><h3>{service.label}</h3><span>{service.name}<ArrowUpRight size={19} /></span></Link>)}</div><div className="explore-foot"><p>Looking for something specific? Search by name, subnet number or capability.</p><Button href="/app/" variant="ink">Explore the directory</Button></div></section>
      <section id="how-it-works" className="landing-how landing-section">
        <div className="request-story">
          <div className="request-story-copy">
            <span className="pixel story-caption">How a request works</span>
            <h2 className="display">Put a subnet<br />to work.</h2>
            <p className="story-intro">Start with a question for Chutes. Subswarm handles the request and keeps the result in your library.</p>
            <ol className="request-sequence">
              <li><span>01</span><div><h3>Write your instructions</h3><p>Choose a service and give it a prompt, a file or the inputs it needs.</p></div></li>
              <li><span>02</span><div><h3>Confirm the quote</h3><p>See the price before sending. The quoted balance is reserved while the request runs.</p></div></li>
              <li><span>03</span><div><h3>Open your saved result</h3><p>Read or download it from your library. A failed request releases the reserved balance.</p></div></li>
            </ol>
          </div>
          <div className="request-specimen">
            <div className="specimen-top pixel"><span>Example request</span><span>Text generation / 01</span></div>
            <div className="specimen-provider"><ProviderLogo id="chutes" size={44} /><div><strong>Chutes</strong><span>Subnet 64</span></div><span className="pixel">Text</span></div>
            <div className="specimen-prompt"><span className="pixel">Instructions</span><blockquote>Explain how Bittensor miners and validators work together. Keep it simple enough for someone new to the network.</blockquote><div className="specimen-setting"><span>Maximum output tokens</span><span>800</span></div></div>
            <div className="specimen-output"><span className="pixel">What comes back</span><p>A written explanation, the model used and a saved request record.</p></div>
            <div className="specimen-checkout"><p>Review the current quote in the workspace before sending.</p><Button href="/app/?subnet=chutes" variant="ink">Open this service</Button></div>
            <div className="specimen-foot pixel">Saved to your library after completion</div>
          </div>
        </div>
      </section>
      <section id="two-worlds" className="landing-modes landing-section"><div className="section-intro"><div><span className="brand-label">Choose your way in</span><h2 className="display">Get to work.<br />Or take a walk.</h2></div><p>A focused workspace when you want to create.<br />A living village when you want to explore.<br />Your wallet and saved work come with you.</p></div><div className="mode-grid"><article className="mode-card"><div className="mode-bar pixel"><span>01 / Workspace</span><span>Made for making</span></div><div className="workspace-preview" aria-hidden="true"><div className="preview-nav"><Mark /><span>SUBSWARM / WORKSPACE</span></div><div className="preview-body"><h3>What will you<br /><em>make today?</em></h3><div className="preview-search"><Search size={15} />Find your next subnet</div><div className="preview-tools"><span><FileText />Write</span><span><Box />Create</span><span><Upload />Store</span></div></div></div><div className="mode-body"><h3 className="display">The workspace</h3><p>Search the catalogue, compare capabilities, send requests and manage every output in one focused interface.</p><Button href="/app/" variant="ink">Open workspace</Button></div></article><article className="mode-card"><div className="mode-bar pixel"><span>02 / Village</span><span>Made for wandering</span></div><div className="village-preview"><Image src="/worlds/town-evening-v3.png" alt="Subswarm's pixel village, with paths connecting the subnet houses" fill sizes="(max-width: 800px) 100vw, 50vw" /><span className="pixel village-preview-label">Your next idea is around the corner.</span></div><div className="mode-body"><h3 className="display">The village</h3><p>Walk between subnet houses, meet registered residents and turn your ideas into quests. Search the map to find your next stop.</p><Button href="/village/" variant="ink">Enter village</Button></div></article></div></section>
      <section id="faq" className="landing-faq landing-section"><div><span className="brand-label pink-label">A little orientation</span><h2 className="display">Good<br />questions.</h2></div><div className="faq-items">{faqs.map(([title, text]) => <details key={title}><summary>{title}<span aria-hidden="true">+</span></summary><p>{text}</p></details>)}</div></section>
      <section className="landing-finale"><span className="pixel">Your idea. A whole network behind it.</span><h2 className="display">Make your<br />first move.</h2><div><Button href="/app/">Open the workspace</Button><Button href="/village/" variant="white">Enter the village</Button></div></section>
    </main><footer className="landing-footer"><Link href="/" className="swarm-wordmark"><Mark />SUBSWARM</Link><p>Independent services. Shared possibilities.</p><nav aria-label="Footer"><Link href="/app/">Workspace</Link><Link href="/village/">Village</Link><a href="#faq">Questions</a><a href="https://www.bittensor.com" target="_blank" rel="noopener noreferrer">Bittensor <ArrowUpRight size={13} /></a></nav></footer>
  </div>;
}
