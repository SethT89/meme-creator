import type { RouteObject } from 'react-router-dom'
import App from './App'
import { GalleryPage } from './features/gallery/GalleryPage'
import { NewCreationPage } from './features/templates/NewCreationPage'
import { EditorPage } from './features/editor/EditorPage'
import { AdminNewTemplatePage } from './features/templates/AdminNewTemplatePage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <GalleryPage /> },
      { path: 'new', element: <NewCreationPage /> },
      { path: 'editor/:creationId', element: <EditorPage /> },
      { path: 'admin/templates/new', element: <AdminNewTemplatePage /> },
    ],
  },
]
