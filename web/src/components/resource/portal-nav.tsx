import Link from 'next/link';

type NavLink = { href: string; label: string };

const CLUSTER_ROLES = new Set(['superadmin', 'cluster_admin', 'coorganizer']);
const INCUBATOR_ROLES = new Set(['director', 'staff']);
const FOUNDER_ROLES = new Set(['founder']);

const CLUSTER_LINKS: NavLink[] = [
  { href: '/app/overview', label: 'Overview' },
  { href: '/app/mapa', label: 'mapa' },
  { href: '/app/instituciones', label: 'instituciones' },
  { href: '/app/incubadoras', label: 'incubadoras' },
  { href: '/app/frameworks', label: 'frameworks' },
  { href: '/app/geo', label: 'geo' },
  { href: '/app/usuarios', label: 'usuarios' },
  { href: '/app/avisos', label: 'avisos' },
];

const INCUBATOR_LINKS: NavLink[] = [
  { href: '/app/overview', label: 'Overview' },
  { href: '/app/mapa', label: 'mapa' },
  { href: '/app/incubadora', label: 'ficha' },
  { href: '/app/startups', label: 'startups' },
  { href: '/app/incubaciones', label: 'incubaciones' },
  { href: '/app/equipo', label: 'equipo' },
  { href: '/app/frameworks', label: 'frameworks' },
  { href: '/app/avisos', label: 'avisos' },
];

const FOUNDER_LINKS: NavLink[] = [
  { href: '/app/mi-startup', label: 'startup' },
  { href: '/app/mi-startup/metricas', label: 'metricas' },
  { href: '/app/avisos', label: 'avisos' },
];

const LIMITED_LINKS: NavLink[] = [{ href: '/app/avisos', label: 'avisos' }];

const NO_PORTAL_MESSAGE = 'Tu rol no tiene portal en este corte';

function normalizeRoles(role: string | string[]): string[] {
  return (Array.isArray(role) ? role : [role]).filter(Boolean);
}

function linksForRoles(roles: string[]): {
  links: NavLink[];
  noPortal: boolean;
} {
  if (roles.some((r) => CLUSTER_ROLES.has(r))) {
    return { links: CLUSTER_LINKS, noPortal: false };
  }
  if (roles.some((r) => INCUBATOR_ROLES.has(r))) {
    return { links: INCUBATOR_LINKS, noPortal: false };
  }
  if (roles.some((r) => FOUNDER_ROLES.has(r))) {
    return { links: FOUNDER_LINKS, noPortal: false };
  }
  return { links: LIMITED_LINKS, noPortal: true };
}

export function PortalNav({ role }: { role: string | string[] }) {
  const roles = normalizeRoles(role);
  const { links, noPortal } = linksForRoles(roles);

  return (
    <nav aria-label="Portal">
      <ul className="flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      {noPortal ? <p>{NO_PORTAL_MESSAGE}</p> : null}
    </nav>
  );
}
