'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormSheet, type FormSheetProps } from './form-sheet';

export type ResourceDetailField = {
  label: string;
  value: string | null;
};

export type ResourceDetailTab = {
  value: string;
  name: string;
  content: React.ReactNode;
};

export type ResourceDetailProps<TEdit = unknown> = {
  title: string;
  fields: ResourceDetailField[];
  tabs: ResourceDetailTab[];
  edit?: FormSheetProps<TEdit>;
  error?: string | null;
};

export function ResourceDetail<TEdit = unknown>({
  title,
  fields,
  tabs,
  edit,
  error,
}: ResourceDetailProps<TEdit>) {
  const visibleFields = fields.filter((field) => field.value !== null);
  const defaultTab = tabs[0]?.value;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {edit ? <FormSheet {...edit} /> : null}
      </div>

      {visibleFields.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {visibleFields.map((field) => (
            <div key={field.label} className="space-y-1">
              <dt className="text-sm text-muted-foreground">{field.label}</dt>
              <dd className="text-sm font-medium">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : tabs.length > 0 ? (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}
