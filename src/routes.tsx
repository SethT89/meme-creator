import type { RouteObject } from 'react-router-dom'
import App from './App'
import { GalleryPage } from './features/gallery/GalleryPage'
import { EditorPage } from './features/editor/EditorPage'
import { AdminNewTemplatePage } from './features/templates/AdminNewTemplatePage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <EditorPage /> },
      { path: 'editor/:creationId', element: <EditorPage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'admin/templates/new', element: <AdminNewTemplatePage /> },
    ],
  },
]
