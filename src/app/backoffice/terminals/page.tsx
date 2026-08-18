import type { Metadata } from 'next';
import TerminalRegistryWorkspace from '@/components/commerce/TerminalRegistryWorkspace';

export const metadata: Metadata = { title: 'เครื่อง POS | PS Rice Commerce' };
export default function TerminalsPage() { return <TerminalRegistryWorkspace />; }
