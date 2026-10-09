import React from 'react';
import UnitLayout from '@/components/unit/UnitLayout';

export default function UnitRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <UnitLayout>{children}</UnitLayout>;
}
