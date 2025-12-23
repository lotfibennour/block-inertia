import { EditorProvider } from '@/components/editor/EditorProvider';
import Sidebar from '@/components/editor/Sidebar';
import TopBar from '@/components/editor/TopBar';
import EditorContainer from '@/components/editor/EditorContainer';
import { Head } from '@inertiajs/react';
import { type EditorPageProps } from '@/types/editor';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Editor',
        href: '/editor',
    },
];

export default function Editor({ initialData }: EditorPageProps) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Editor" />
            <EditorProvider initialData={initialData}>
                <div className="flex flex-1 h-[calc(100vh-4rem)] overflow-hidden">
                    <Sidebar />
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <TopBar />
                        <EditorContainer />
                    </div>
                </div>
            </EditorProvider>
        </AppLayout>
    );
}
