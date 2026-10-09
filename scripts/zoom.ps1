Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('C:\Users\NGOCNGUYEN\.gemini\antigravity\brain\7ac02a7b-1717-4f99-aa54-34e7ada4ae4f\part_3.png')
$w = $img.Width
$h = 160
$rect = New-Object System.Drawing.Rectangle(0, 50, $w, $h)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$outPath = 'C:\Users\NGOCNGUYEN\.gemini\antigravity\brain\7ac02a7b-1717-4f99-aa54-34e7ada4ae4f\part_3_zoom.png'
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$img.Dispose()
Write-Output 'Saved zoom successfully'
