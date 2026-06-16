import './globals.css';

export const metadata = {
  title: 'CIMB CFO Agent — Demo',
  description: 'PoC v2 demo for ada Solutioning/CDP/CAI internal alignment'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
