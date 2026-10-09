Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('C:\Users\NGOCNGUYEN\.gemini\antigravity\brain\7ac02a7b-1717-4f99-aa54-34e7ada4ae4f\part_3.png')
[int]$w = $img.Width
[int]$h = 100
$rect = New-Object System.Drawing.Rectangle(0, 240, $w, $h)
[int]$scale = 2
[int]$newW = $w * $scale
[int]$newH = $h * $scale
$bmp = New-Object System.Drawing.Bitmap($newW, $newH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $newW, $newH)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$outPath = 'C:\Users\NGOCNGUYEN\.gemini\antigravity\brain\7ac02a7b-1717-4f99-aa54-34e7ada4ae4f\part_3_zoom3.png'
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$img.Dispose()
Write-Output 'Saved part_3_zoom3 successfully'
