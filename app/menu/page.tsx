export const metadata = {
  title: 'Yum of India — Menu',
  description: 'Yum of India McKinney — Pure · Authentic · Indian',
}

const IMAGES = ['/menu/1.png', '/menu/2.png', '/menu/3.png', '/menu/4.png', '/menu/5.png', '/menu/6.png', '/menu/7.png']

export default function MenuPage() {
  return (
    <main style={{ background: '#f5f5f5', minHeight: '100vh', margin: 0, padding: 0 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {IMAGES.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={`Menu page ${i + 1}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </div>
    </main>
  )
}
