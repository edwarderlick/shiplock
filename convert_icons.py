from PIL import Image
import sys

def convert_icons(src_path):
    img = Image.open(src_path)
    
    # Generate favicon.ico (usually 16x16, 32x32, 48x48)
    img_ico = img.resize((32, 32), Image.Resampling.LANCZOS)
    img_ico.save('web/public/favicon.ico', format='ICO', sizes=[(32, 32)])
    
    # Generate favicon-32.png
    img_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    img_32.save('web/public/favicon-32.png', format='PNG')
    
    # Generate apple-touch-icon.png (usually 180x180 or 512x512)
    img_apple = img.resize((512, 512), Image.Resampling.LANCZOS)
    img_apple.save('web/public/apple-touch-icon.png', format='PNG')

if __name__ == '__main__':
    convert_icons(sys.argv[1])
