import { createBrowserRouter } from 'react-router-dom'
import BasicLayout from '@/layouts/BasicLayout'
import Placeholder from '@/components/Placeholder'
import Home from '@/pages/Home'
import NotesList from '@/pages/Notes/List'
import NoteDetail from '@/pages/Notes/Detail'
import ProjectsList from '@/pages/Projects/List'
import ProjectDetail from '@/pages/Projects/Detail'
import SnippetsList from '@/pages/Snippets/List'
import SnippetDetail from '@/pages/Snippets/Detail'
import BooksList from '@/pages/Books/List'
import BookReader from '@/pages/Books/Reader'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BasicLayout />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'notes',
        children: [
          { index: true, element: <NotesList /> },
          { path: ':id', element: <NoteDetail /> },
        ],
      },
      {
        path: 'projects',
        children: [
          { index: true, element: <ProjectsList /> },
          { path: ':id', element: <ProjectDetail /> },
        ],
      },
      {
        path: 'snippets',
        children: [
          { index: true, element: <SnippetsList /> },
          { path: ':noteId', element: <SnippetDetail /> },
        ],
      },
      {
        path: 'books',
        children: [
          { index: true, element: <BooksList /> },
          { path: '*', element: <BookReader /> },
        ],
      },
      { path: 'about', element: <Placeholder title="关于" hint="个人介绍、技能栈与联系方式" /> },
      { path: '*', element: <Placeholder title="404" hint="页面不存在，检查一下地址" /> },
    ],
  },
])
