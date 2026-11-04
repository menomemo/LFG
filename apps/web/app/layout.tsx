import type {Metadata} from 'next';
import type {ReactNode} from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'LFG',
  description: 'Run a cross-border job search like a managed portfolio',
};

export default function RootLayout({children}: {readonly children: ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
