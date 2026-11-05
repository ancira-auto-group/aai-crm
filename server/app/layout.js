import './globals.css';

export const metadata = {
  title: 'AAI for CRM Admin',
  description: 'Manage users, rooftops, prompts and usage for the AAI for CRM extension'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
