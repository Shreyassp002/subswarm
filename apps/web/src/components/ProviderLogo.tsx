"use client";
import Image from "next/image";
import { Bot, Box } from "lucide-react";
import { useState } from "react";
import type { ProviderId } from "@subswarm/shared";
import { districts } from "@/lib/providers";
const marks: Partial<Record<ProviderId | "kova" | "talos", string>> = { bitmind: "bitmind.png", zeus: "zeus.png", ditto: "ditto.svg", "404gen": "404gen.png", saygm: "saygm.svg", desearch: "desearch.png", chutes: "chutes.png", attelier: "attelier.svg", hippius: "hippius.png", ridges: "ridges.png", everyframe: "everyframe.svg", network: "network.ico" };
export default function ProviderLogo({ id, size = 36 }: { id: ProviderId | "kova" | "talos"; size?: number }) {
  const [failed, setFailed] = useState(false);
  const Icon = id === "kova" ? Box : id === "talos" ? Bot : districts[id].icon;
  return <span className={`provider-logo logo-${id}`} style={{ width: size, height: size }}>{marks[id] && !failed ? <Image src={`/logos/${marks[id]}`} width={size} height={size} alt="" onError={() => setFailed(true)} /> : <Icon size={size * .6} />}</span>;
}
