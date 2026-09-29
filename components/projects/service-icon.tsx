import { Activity, Box, Globe, HardDrive, Server } from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { PostgresMark } from "@/components/icons/postgres-mark";
import { RedisMark } from "@/components/icons/redis-mark";
import { iconKind } from "@/lib/projects";
import type { ServiceNode } from "@/lib/api";

/**
 * Renders a node's glyph.
 *
 * The icon is selected with an explicit switch rather than by looking a
 * component up in a map and aliasing it into a capitalized local. Both render
 * the same thing, but only this form lets the React compiler see a static set
 * of components.
 */
export function ServiceIcon({ node, size = 15 }: { node: ServiceNode; size?: number }) {
  const stroke = 1.7;

  switch (iconKind(node)) {
    case "database":
      return <PostgresMark size={size} />;
    case "cache":
      return <RedisMark size={size} />;
    case "container":
      return <Box size={size} strokeWidth={stroke} />;
    case "server":
      return <Server size={size} strokeWidth={stroke} />;
    case "worker":
      return <Activity size={size} strokeWidth={stroke} />;
    case "github":
      return <GithubMark size={size} />;
    case "archive":
      return <HardDrive size={size} strokeWidth={stroke} />;
    default:
      return <Globe size={size} strokeWidth={stroke} />;
  }
}
