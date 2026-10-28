import { redirect } from 'next/navigation';

// REQ-NAV-02: land on the Worship Library default view.
export default function RootPage() {
  redirect('/library');
}
