import { EditorProvider } from '@/components/editor/EditorProvider';
import Sidebar from '@/components/editor/Sidebar';
import TopBar from '@/components/editor/TopBar';
import EditorContainer from '@/components/editor/EditorContainer';
import { Head } from '@inertiajs/react';
import { type EditorPageProps } from '@/types/editor';

export default function Editor({ initialData }: EditorPageProps) {
    return (
        <>
            <Head title="Editor" />
            <EditorProvider initialData={initialData}>
                <div className="editor-app">
                    <Sidebar />
                    <div className="editor-main-content">
                        <TopBar />
                        <EditorContainer />
                    </div>
                </div>
            </EditorProvider>
        </>
    );
}
