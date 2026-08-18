import { CommerceShell } from '@/components/commerce/CommerceShell';

export default function BackofficeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <CommerceShell section="backoffice">{children}</CommerceShell>;
}
