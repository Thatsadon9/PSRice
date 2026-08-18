import { CommerceShell } from '@/components/commerce/CommerceShell';

export default function PosLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <CommerceShell section="pos">{children}</CommerceShell>;
}
