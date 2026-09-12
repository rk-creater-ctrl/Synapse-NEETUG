import { ReactNode } from 'react';

import { MentorAuthProvider } from '../lib/mentor-auth-context';
import './styles.css';

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><MentorAuthProvider>{children}</MentorAuthProvider></body></html>;
}
