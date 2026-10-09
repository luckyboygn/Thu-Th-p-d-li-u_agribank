Add-Type -AssemblyName System.Drawing
$imgPath = 'C:\Users\NGOCNGUYEN\.gemini\antigravity\brain\7ac02a7b-1717-4f99-aa54-34e7ada4ae4f\.user_uploaded\media_1790912988178.png'
$img = [System.Drawing.Image]::FromFile($imgPath)
Write-Output "Dimensions: $($img.Width) x $($img.Height)"
$chunkH = [int]($img.Height / 3)

for ($i = 0; $i -lt 3; $i++) {
    $rect = New-Object System.Drawing.Rectangle(0, ($i * $chunkH), $img.Width, $chunkH)
    $bmp = New-Object System.Drawing.Bitmap($img.Width, $chunkH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $img.Width, $chunkH)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $outPath = "C:\Users\NGOCNGUYEN\.gemini\antigravity\brain\7ac02a7b-1717-4f99-aa54-34e7ada4ae4f\part_$($i+1).png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Saved part_$($i+1).png"
}
$img.Dispose()
