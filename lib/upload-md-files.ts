export interface UploadedMdFile {
  name: string
  content: string
}

type FileWithRelativePath = File & { webkitRelativePath?: string }

export async function readUploadedMdFiles(fileList: FileList | null): Promise<{ files: UploadedMdFile[]; skipped: number }> {
  if (!fileList || fileList.length === 0) return { files: [], skipped: 0 }

  const picked = Array.from(fileList)
  const mdFiles = picked.filter(file => {
    const relative = (file as FileWithRelativePath).webkitRelativePath?.trim()
    const candidateName = relative || file.name
    return candidateName.toLowerCase().endsWith('.md')
  })

  const files = await Promise.all(mdFiles.map(async file => {
    const relative = (file as FileWithRelativePath).webkitRelativePath?.trim()
    return {
      name: relative || file.name,
      content: await file.text(),
    }
  }))

  return { files, skipped: picked.length - files.length }
}
